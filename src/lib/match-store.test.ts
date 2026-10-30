import * as Sentry from "@sentry/nextjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { match, participants } from "@/lib/analyzer/test-fixtures";
import { tables } from "@/db";
import { getMatch } from "@/lib/riot/api";
import { loadMatches } from "./match-store";

vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/riot/api", () => ({ getMatch: vi.fn(), getTimeline: vi.fn() }));
// A database with no saved games, so every game is missing. Its inserts
// throw on an empty list, the way Drizzle's do, and record which table
// each write went to.
const inserted: { table: unknown; rows: unknown }[] = [];
const insert = (table: unknown) => ({
  values: (rows: unknown) => {
    if (Array.isArray(rows) && rows.length === 0) {
      throw new Error("values() must be called with at least one value");
    }
    inserted.push({ table, rows });
    return { onConflictDoNothing: async () => {} };
  },
});
vi.mock("@/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db")>()),
  getDb: () => ({
    query: { matches: { findMany: async () => [] } },
    transaction: async (write: (tx: unknown) => Promise<void>) => write({ insert }),
  }),
}));

const ids = Array.from({ length: 30 }, (_, i) => `NA1_${i}`);

beforeEach(() => {
  vi.mocked(getMatch)
    .mockReset()
    .mockImplementation(async (_region, id) => ({ ...match(participants()), metadata: { matchId: id } }));
});

afterEach(() => {
  vi.unstubAllEnvs();
  inserted.length = 0;
  vi.mocked(Sentry.captureException).mockClear();
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

  it("still saves a game Riot sent with no players in it", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://test");
    vi.mocked(getMatch).mockImplementation(async (_region, id) => ({
      ...match([]),
      metadata: { matchId: id },
    }));
    await loadMatches("na", ["NA1_0"], 20, "now");
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(inserted).toHaveLength(1);
    expect(inserted[0].table).toBe(tables.matches);
    expect(inserted[0].rows).toMatchObject({ matchId: "NA1_0" });
  });

  it("saves a game's scoreboard rows along with the game", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://test");
    await loadMatches("na", ["NA1_0"], 20, "now");
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(inserted.map((w) => w.table)).toEqual([tables.matches, tables.matchParticipants]);
    expect(inserted[1].rows).toHaveLength(10);
  });
});
