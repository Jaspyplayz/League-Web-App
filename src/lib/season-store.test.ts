import { beforeEach, describe, expect, it, vi } from "vitest";
import { participants, match } from "@/lib/analyzer/test-fixtures";
import { getMatchIds } from "@/lib/riot/api";
import { RiotApiError } from "@/lib/riot/client";
import { loadMatches } from "@/lib/match-store";
import type { SeasonGame } from "./season";
import { loadSeasonStats } from "./season-store";

vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/riot/api", () => ({ getMatchIds: vi.fn() }));

// A pretend database: the saved season list, the player's saved games, and
// a record of what was written.
let savedList: { matchIds: string[]; fetchedAt: Date } | undefined;
let savedGames: SeasonGame[];
let written: string[][];
let hasDatabase: boolean;
const fakeDb = {
  query: { playerSeasons: { findFirst: async () => savedList } },
  select: () => ({ from: () => ({ innerJoin: () => ({ where: async () => savedGames }) }) }),
  insert: () => ({
    values: (row: { matchIds: string[] }) => {
      written.push(row.matchIds);
      return { onConflictDoUpdate: async () => {} };
    },
  }),
};
vi.mock("@/lib/match-store", () => ({
  database: () => (hasDatabase ? fakeDb : null),
  readCache: (read: (db: typeof fakeDb) => unknown) => read(fakeDb),
  loadMatches: vi.fn(),
}));

const profileUpdatedAt = new Date("2026-03-01T12:00:00Z");

function saved(matchId: string, championName = "Vi"): SeasonGame {
  return {
    matchId,
    queueId: 420,
    durationS: 1800,
    championName,
    win: true,
    kills: 5,
    deaths: 2,
    assists: 7,
    cs: 180,
  };
}

// A new game where player-2 (blue jungle in the fixtures) played Vi.
function newMatch(matchId: string) {
  return { ...match(participants()), metadata: { matchId } };
}

beforeEach(() => {
  hasDatabase = true;
  savedList = undefined;
  savedGames = [];
  written = [];
  vi.mocked(getMatchIds).mockReset();
  vi.mocked(loadMatches)
    .mockReset()
    .mockImplementation(async (_region, ids) => ({
      matches: ids.map(newMatch),
      waiting: 0,
      error: null,
    }));
});

describe("loadSeasonStats", () => {
  it("uses the saved season list and loads a few missing games", async () => {
    savedList = { matchIds: ["NA1_3", "NA1_2", "NA1_1"], fetchedAt: profileUpdatedAt };
    savedGames = [saved("NA1_1", "LeeSin")];

    const stats = await loadSeasonStats("na", "player-2", profileUpdatedAt, null, true);

    expect(getMatchIds).not.toHaveBeenCalled();
    expect(loadMatches).toHaveBeenCalledWith("na", ["NA1_3", "NA1_2"], 10);
    expect(stats).toMatchObject({ loaded: 3, total: 3 });
    expect(stats?.champions.map((c) => [c.championName, c.games])).toEqual([
      ["Vi", 2],
      ["LeeSin", 1],
    ]);
  });

  it("asks Riot for no new games when the view may not load more", async () => {
    savedList = { matchIds: ["NA1_3", "NA1_2", "NA1_1"], fetchedAt: profileUpdatedAt };
    savedGames = [saved("NA1_1", "LeeSin")];

    const stats = await loadSeasonStats("na", "player-2", profileUpdatedAt, null, false);

    // A tab or "Show 10 more games" URL shows the saved games only.
    expect(vi.mocked(loadMatches).mock.calls.flatMap(([, ids]) => ids)).toEqual([]);
    expect(stats).toMatchObject({ loaded: 1, total: 3 });
    expect(stats?.champions.map((c) => c.championName)).toEqual(["LeeSin"]);
  });

  it("lists the season again, page by page, once the profile is newer", async () => {
    savedList = { matchIds: ["NA1_old"], fetchedAt: new Date("2026-02-01T00:00:00Z") };
    const fullPage = Array.from({ length: 100 }, (_, i) => `NA1_${i + 10}`);
    vi.mocked(getMatchIds).mockResolvedValueOnce(fullPage).mockResolvedValueOnce(["NA1_1"]);

    const stats = await loadSeasonStats("na", "player-2", profileUpdatedAt, null, true);

    expect(getMatchIds).toHaveBeenCalledTimes(2);
    expect(vi.mocked(getMatchIds).mock.calls[1][3]).toMatchObject({ start: 100 });
    expect(written).toEqual([[...fullPage, "NA1_1"]]);
    expect(stats?.total).toBe(101);
  });

  it("keeps the old list when Riot can't be reached", async () => {
    savedList = { matchIds: ["NA1_1"], fetchedAt: new Date("2026-02-01T00:00:00Z") };
    savedGames = [saved("NA1_1")];
    vi.mocked(getMatchIds).mockRejectedValue(new RiotApiError("unavailable", "down"));

    const stats = await loadSeasonStats("na", "player-2", profileUpdatedAt, null, true);

    expect(stats).toMatchObject({ loaded: 1, total: 1 });
  });

  it("returns null without a database to remember games in", async () => {
    hasDatabase = false;
    expect(await loadSeasonStats("na", "player-2", profileUpdatedAt, null, true)).toBeNull();
    expect(getMatchIds).not.toHaveBeenCalled();
  });
});
