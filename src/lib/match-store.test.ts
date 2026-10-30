import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { match, participants } from "@/lib/analyzer/test-fixtures";
import { getMatch } from "@/lib/riot/api";
import { loadMatches } from "./match-store";

vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/riot/api", () => ({ getMatch: vi.fn(), getTimeline: vi.fn() }));
// A database with no saved games, so every game is missing.
vi.mock("@/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db")>()),
  getDb: () => ({ query: { matches: { findMany: async () => [] } } }),
}));

const ids = Array.from({ length: 30 }, (_, i) => `NA1_${i}`);

beforeEach(() => {
  vi.mocked(getMatch)
    .mockReset()
    .mockImplementation(async (_region, id) => ({ ...match(participants()), metadata: { matchId: id } }));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("loadMatches", () => {
  it("asks Riot for at most `budget` missing games and counts the rest as waiting", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://test");
    const result = await loadMatches("na", ids, 20);
    expect(getMatch).toHaveBeenCalledTimes(20);
    expect(result.matches.map((m) => m.metadata.matchId)).toEqual(ids.slice(0, 20));
    expect(result.waiting).toBe(10);
  });

  it("fetches everything without a database, since nothing is remembered", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const result = await loadMatches("na", ids, 20);
    expect(getMatch).toHaveBeenCalledTimes(30);
    expect(result.waiting).toBe(0);
  });
});
