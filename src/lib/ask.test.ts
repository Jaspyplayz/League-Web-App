import { beforeEach, describe, expect, it, vi } from "vitest";
import { costMicros, HOLD_MICROS } from "@/lib/ask-rules";
import { recentGamesFor } from "@/lib/mcp/tools";
import type { Account } from "@/lib/riot/types";
import { answerQuestion } from "./ask";

// A pretend Anthropic client: each test says what each round returns.
// APIError is the SDK's error for when Anthropic answered with an error
// status; a timeout or a dropped connection has no status.
const { create, APIError } = vi.hoisted(() => ({
  create: vi.fn(),
  APIError: class extends Error {
    constructor(readonly status: number | undefined) {
      super(`status ${status}`);
    }
  },
}));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    static APIError = APIError;
    beta = { messages: { create } };
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

beforeEach(() => {
  create.mockReset();
  vi.mocked(recentGamesFor).mockResolvedValue({ games: [] } as never);
});

describe("answerQuestion", () => {
  it("adds up every round's cost and returns the answer", async () => {
    create.mockResolvedValueOnce(askForGames).mockResolvedValueOnce({
      model: "claude-sonnet-5-5",
      usage,
      stop_reason: "end_turn",
      content: [{ type: "text", text: "You die early in most losses." }],
    });

    const result = await answerQuestion("na", account, "Why do I lose?");

    expect(result.answer).toBe("You die early in most losses.");
    expect(result.costMicros).toBe(2 * costMicros("claude-sonnet-5-5", usage));
    expect(result.error).toBeUndefined();
  });

  // Each round gets two tries, half a second apart, so these tests take a
  // second or so.
  it("keeps what the finished rounds cost when Anthropic turns a later round down", async () => {
    const overloaded = new APIError(529);
    create
      .mockResolvedValueOnce(askForGames)
      .mockRejectedValueOnce(overloaded)
      .mockRejectedValueOnce(overloaded);

    const result = await answerQuestion("na", account, "Why do I lose?");

    expect(create).toHaveBeenCalledTimes(3);
    expect(result.answer).toBeNull();
    expect(result.costMicros).toBe(costMicros("claude-sonnet-5-5", usage));
    expect(result.error).toBe(overloaded);
  });

  it("costs nothing when Anthropic turns down both tries of the first round", async () => {
    create.mockRejectedValueOnce(new APIError(529)).mockRejectedValueOnce(new APIError(429));

    const result = await answerQuestion("na", account, "Why do I lose?");

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

    const result = await answerQuestion("na", account, "Why do I lose?");

    // Once per round, not once per try.
    expect(result.costMicros).toBe(costMicros("claude-sonnet-5-5", usage) + HOLD_MICROS);
  });

  it("still adds the estimate when a timed-out try is followed by an overloaded one", async () => {
    create.mockRejectedValueOnce(new APIError(undefined)).mockRejectedValueOnce(new APIError(529));

    const result = await answerQuestion("na", account, "Why do I lose?");

    expect(result).toMatchObject({ answer: null, costMicros: HOLD_MICROS });
  });

  it("adds the estimate when a try timed out before the retry answered", async () => {
    create.mockRejectedValueOnce(new APIError(undefined)).mockResolvedValueOnce({
      model: "claude-sonnet-5-5",
      usage,
      stop_reason: "end_turn",
      content: [{ type: "text", text: "You die early in most losses." }],
    });

    const result = await answerQuestion("na", account, "Why do I lose?");

    expect(result.answer).toBe("You die early in most losses.");
    expect(result.costMicros).toBe(costMicros("claude-sonnet-5-5", usage) + HOLD_MICROS);
    expect(result.error).toBeUndefined();
  });
});
