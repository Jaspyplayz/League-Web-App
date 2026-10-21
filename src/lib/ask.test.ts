import { beforeEach, describe, expect, it, vi } from "vitest";
import { costMicros } from "@/lib/ask-rules";
import { recentGamesFor } from "@/lib/mcp/tools";
import type { Account } from "@/lib/riot/types";
import { answerQuestion } from "./ask";

// A pretend Anthropic client: each test says what each round returns.
const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
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

  it("keeps what the finished rounds cost when a later round fails", async () => {
    const overloaded = new Error("overloaded");
    create.mockResolvedValueOnce(askForGames).mockRejectedValueOnce(overloaded);

    const result = await answerQuestion("na", account, "Why do I lose?");

    expect(result.answer).toBeNull();
    expect(result.costMicros).toBe(costMicros("claude-sonnet-5-5", usage));
    expect(result.error).toBe(overloaded);
  });

  it("costs nothing when the first round fails", async () => {
    create.mockRejectedValueOnce(new Error("network"));

    const result = await answerQuestion("na", account, "Why do I lose?");

    expect(result).toMatchObject({ answer: null, costMicros: 0 });
    expect(result.error).toBeInstanceOf(Error);
  });
});
