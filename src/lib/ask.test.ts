import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { costMicros, HOLD_MICROS } from "@/lib/ask-rules";
import { recentGamesFor } from "@/lib/mcp/tools";
import type { Account } from "@/lib/riot/types";
import { answerQuestion } from "./ask";

// A pretend Anthropic client: each test says what each round returns, and
// `clientOptions` records how the client was set up. APIError is the SDK's
// error for when Anthropic answered with an error status (and its headers);
// a timeout or a dropped connection is one with no status.
const { create, clientOptions, APIError } = vi.hoisted(() => ({
  create: vi.fn(),
  clientOptions: [] as unknown[],
  APIError: class extends Error {
    constructor(
      readonly status: number | undefined,
      readonly headers?: Headers,
    ) {
      super(`status ${status}`);
    }
  },
}));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    static APIError = APIError;
    beta = { messages: { create } };
    constructor(options: unknown) {
      clientOptions.push(options);
    }
  },
}));
vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/mcp/tools", () => ({
  MAX_RECENT_GAMES: 20,
  recentGamesFor: vi.fn(),
  analyzeGameFor: vi.fn(),
}));
vi.mock("@/lib/mcp/answers", () => ({ riotErrorMessage: () => "Riot isn't answering." }));
vi.mock("@/lib/riot/client", () => ({ RiotApiError: class extends Error {} }));

const account = { puuid: "player-1", gameName: "Jaspy", tagLine: "CA1" } as Account;
const usage = { input_tokens: 10_000, output_tokens: 1_000 };

// Claude's first round: it asks for the player's recent games.
const askForGames = {
  model: "claude-sonnet-5-5",
  usage,
  stop_reason: "tool_use",
  content: [{ type: "tool_use", id: "call-1", name: "recent_games", input: { count: 5 } }],
};

// Claude's last round: the answer.
const answers = {
  model: "claude-sonnet-5-5",
  usage,
  stop_reason: "end_turn",
  content: [{ type: "text", text: "You die early in most losses." }],
};

// The pause between tries is a timer, so the tests fake the clock and
// skip it instead of waiting.
beforeEach(() => {
  vi.useFakeTimers();
  clientOptions.length = 0;
  create.mockReset();
  vi.mocked(recentGamesFor).mockResolvedValue({ games: [] } as never);
});

afterEach(() => {
  vi.useRealTimers();
});

// Asks a question and lets every pause between tries pass at once.
async function ask() {
  const answer = answerQuestion("na", account, "Why do I lose?");
  await vi.runAllTimersAsync();
  return answer;
}

// Asks a question whose first try fails, and returns how many tries had
// been sent after `ms` milliseconds, and after one more.
async function triesAfter(ms: number) {
  const answer = answerQuestion("na", account, "Why do I lose?");
  await vi.advanceTimersByTimeAsync(ms);
  const before = create.mock.calls.length;
  await vi.advanceTimersByTimeAsync(1);
  const after = create.mock.calls.length;
  await vi.runAllTimersAsync();
  await answer;
  return [before, after];
}

describe("answerQuestion", () => {
  it("adds up every round's cost and returns the answer", async () => {
    create.mockResolvedValueOnce(askForGames).mockResolvedValueOnce(answers);

    const result = await ask();

    expect(result.answer).toBe("You die early in most losses.");
    expect(result.costMicros).toBe(2 * costMicros("claude-sonnet-5-5", usage));
    expect(result.error).toBeUndefined();
  });

  it("prices each round at the model that answered it", async () => {
    // Anthropic handed the last round to a fallback model.
    create.mockResolvedValueOnce(askForGames).mockResolvedValueOnce({
      ...answers,
      model: "claude-opus-5-5",
    });

    const result = await ask();

    expect(result.costMicros).toBe(
      costMicros("claude-sonnet-5-5", usage) + costMicros("claude-opus-5-5", usage),
    );
    expect(result.model).toBe("claude-opus-5-5");
  });

  // The SDK's own retry would hide a timed-out try behind the next one, so
  // it's off, and sendRound makes the second try instead.
  it("turns off the SDK's own retry and gives each try a minute", async () => {
    create.mockResolvedValueOnce(answers);

    await ask();

    expect(clientOptions).toEqual([{ maxRetries: 0, timeout: 60_000 }]);
    // Options on a request would override the client's, so there are none.
    expect(create.mock.calls.every((call) => call.length === 1)).toBe(true);
  });

  it("waits half a second before the second try", async () => {
    create.mockRejectedValueOnce(new APIError(529)).mockResolvedValueOnce(answers);

    expect(await triesAfter(499)).toEqual([1, 2]);
  });

  it("waits as long as a rate limited answer asks before the second try", async () => {
    const rateLimited = new APIError(429, new Headers({ "retry-after": "3" }));
    create.mockRejectedValueOnce(rateLimited).mockResolvedValueOnce(answers);

    expect(await triesAfter(2999)).toEqual([1, 2]);
  });

  it("waits at most 10 seconds, however long Anthropic asks", async () => {
    const rateLimited = new APIError(429, new Headers({ "retry-after": "60" }));
    create.mockRejectedValueOnce(rateLimited).mockResolvedValueOnce(answers);

    expect(await triesAfter(9999)).toEqual([1, 2]);
  });

  it("keeps what the finished rounds cost when Anthropic turns a later round down", async () => {
    const overloaded = new APIError(529);
    create
      .mockResolvedValueOnce(askForGames)
      .mockRejectedValueOnce(overloaded)
      .mockRejectedValueOnce(overloaded);

    const result = await ask();

    expect(create).toHaveBeenCalledTimes(3);
    expect(result.answer).toBeNull();
    expect(result.costMicros).toBe(costMicros("claude-sonnet-5-5", usage));
    expect(result.error).toBe(overloaded);
  });

  it("costs nothing when Anthropic turns down both tries of the first round", async () => {
    create.mockRejectedValueOnce(new APIError(529)).mockRejectedValueOnce(new APIError(429));

    const result = await ask();

    expect(result).toMatchObject({ answer: null, costMicros: 0 });
    expect(result.error).toBeInstanceOf(APIError);
  });

  // A timeout or lost connection is an APIError with no status in the SDK.
  it("adds the estimate for a round whose tries timed out, since they may have been billed", async () => {
    const timeout = new APIError(undefined);
    create
      .mockResolvedValueOnce(askForGames)
      .mockRejectedValueOnce(timeout)
      .mockRejectedValueOnce(timeout);

    const result = await ask();

    // Once per round, not once per try.
    expect(result.costMicros).toBe(costMicros("claude-sonnet-5-5", usage) + HOLD_MICROS);
  });

  it("still adds the estimate when a timed-out try is followed by an overloaded one", async () => {
    create.mockRejectedValueOnce(new APIError(undefined)).mockRejectedValueOnce(new APIError(529));

    const result = await ask();

    expect(result).toMatchObject({ answer: null, costMicros: HOLD_MICROS });
  });

  it("adds the estimate when a try timed out before the retry answered", async () => {
    create.mockRejectedValueOnce(new APIError(undefined)).mockResolvedValueOnce(answers);

    const result = await ask();

    expect(result.answer).toBe("You die early in most losses.");
    expect(result.costMicros).toBe(costMicros("claude-sonnet-5-5", usage) + HOLD_MICROS);
    expect(result.error).toBeUndefined();
  });

  // Anthropic's reply was cut off after it started, so the work was done.
  it("adds the estimate when a reply is cut off partway", async () => {
    create
      .mockRejectedValueOnce(new TypeError("terminated"))
      .mockRejectedValueOnce(new TypeError("terminated"));

    const result = await ask();

    expect(create).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ answer: null, costMicros: HOLD_MICROS });
  });

  // 500 and 504 can come after Anthropic started on the request.
  it.each([500, 504])(
    "adds the estimate for a %i, a server error that isn't 'overloaded'",
    async (status) => {
      create.mockRejectedValueOnce(new APIError(status)).mockRejectedValueOnce(new APIError(529));

      const result = await ask();

      expect(result).toMatchObject({ answer: null, costMicros: HOLD_MICROS });
    },
  );

  it("adds the estimate when a try succeeds with an empty or unreadable reply", async () => {
    create.mockResolvedValueOnce(undefined).mockResolvedValueOnce("<html>ok</html>");

    const result = await ask();

    expect(create).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ answer: null, costMicros: HOLD_MICROS });
    expect(result.error).toBeInstanceOf(Error);
  });
});
