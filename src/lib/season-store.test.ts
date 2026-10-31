import { beforeEach, describe, expect, it, vi } from "vitest";
import { tables } from "@/db";
import { participants, match } from "@/lib/analyzer/test-fixtures";
import { getMatch, getMatchIds } from "@/lib/riot/api";
import { RiotApiError } from "@/lib/riot/client";
import type { SeasonGame } from "./season";
import { fairShares, loadSeasonStats, SYNC_CALLS, syncSeasons } from "./season-store";

vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/riot/api", () => ({ getMatchIds: vi.fn(), getMatch: vi.fn() }));

// A pretend database: the saved season list, the player's saved games (slim
// rows in season_games, whole games in matches), the region the player's
// profile is saved for, the "This is me" players, and a record of what was
// written.
let savedRegion: string | undefined;
let savedList: { matchIds: string[]; fetchedAt: Date } | undefined;
let slimGames: SeasonGame[];
let wholeGames: SeasonGame[];
let tracked: { puuid: string; region: string; name: string; tag: string }[];
let writtenLists: string[][];
let writtenGames: { puuid: string; matchId: string }[];
let hasDatabase: boolean;
const fakeDb = {
  query: {
    playerSeasons: { findFirst: async () => savedList },
    players: { findFirst: async () => (savedRegion === undefined ? undefined : { region: savedRegion }) },
  },
  select: () => ({
    from: (table: unknown) =>
      table === tables.seasonGames
        ? { where: async () => slimGames }
        : { innerJoin: () => ({ where: async () => wholeGames }) },
  }),
  selectDistinct: () => ({ from: () => ({ innerJoin: () => ({ orderBy: async () => tracked }) }) }),
  insert: (table: unknown) => ({
    values: (row: { matchIds: string[] } | { puuid: string; matchId: string }[]) => {
      if (table === tables.seasonGames) {
        writtenGames.push(...(row as { puuid: string; matchId: string }[]));
      } else {
        writtenLists.push((row as { matchIds: string[] }).matchIds);
      }
      return { onConflictDoUpdate: async () => {}, onConflictDoNothing: async () => {} };
    },
  }),
};
vi.mock("@/lib/match-store", () => ({
  database: () => (hasDatabase ? fakeDb : null),
  readCache: (read: (db: typeof fakeDb) => unknown) => read(fakeDb),
  remember: (_timing: string, write: (db: typeof fakeDb) => Promise<void>) => write(fakeDb),
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

// A game this season where player-2 (blue jungle in the fixtures) played Vi.
function newMatch(matchId: string) {
  const m = match(participants());
  return {
    ...m,
    metadata: { matchId },
    info: { ...m.info, gameStartTimestamp: Date.UTC(2026, 1, 1) },
  };
}

beforeEach(() => {
  hasDatabase = true;
  savedRegion = "na";
  savedList = undefined;
  slimGames = [];
  wholeGames = [];
  tracked = [];
  writtenLists = [];
  writtenGames = [];
  vi.mocked(getMatchIds).mockReset();
  vi.mocked(getMatch)
    .mockReset()
    .mockImplementation(async (_region, id) => newMatch(id));
});

describe("loadSeasonStats", () => {
  // What the plain profile page passes; every other view passes false.
  const plainPage = { loadMore: true };

  it("counts slim and whole saved games, and saves a few missing ones as slim rows", async () => {
    savedList = { matchIds: ["NA1_4", "NA1_3", "NA1_2", "NA1_1"], fetchedAt: profileUpdatedAt };
    slimGames = [saved("NA1_2", "LeeSin")];
    wholeGames = [saved("NA1_1", "LeeSin")];

    const stats = await loadSeasonStats("na", "player-2", profileUpdatedAt, null, plainPage);

    expect(getMatchIds).not.toHaveBeenCalled();
    expect(vi.mocked(getMatch).mock.calls.map(([, id]) => id)).toEqual(["NA1_4", "NA1_3"]);
    expect(writtenGames.map((g) => [g.puuid, g.matchId])).toEqual([
      ["player-2", "NA1_4"],
      ["player-2", "NA1_3"],
    ]);
    expect(stats).toMatchObject({ loaded: 4, total: 4 });
    expect(stats?.champions.map((c) => [c.championName, c.games])).toEqual([
      ["LeeSin", 2],
      ["Vi", 2],
    ]);
  });

  it("counts a game saved both ways once", async () => {
    savedList = { matchIds: ["NA1_1"], fetchedAt: profileUpdatedAt };
    slimGames = [saved("NA1_1")];
    wholeGames = [saved("NA1_1")];

    const stats = await loadSeasonStats("na", "player-2", profileUpdatedAt, null, plainPage);

    expect(getMatch).not.toHaveBeenCalled();
    expect(stats).toMatchObject({ loaded: 1, total: 1 });
  });

  it("loads at most 10 missing games per view", async () => {
    const ids = Array.from({ length: 30 }, (_, i) => `NA1_${i}`);
    savedList = { matchIds: ids, fetchedAt: profileUpdatedAt };

    const stats = await loadSeasonStats("na", "player-2", profileUpdatedAt, null, plainPage);

    expect(getMatch).toHaveBeenCalledTimes(10);
    expect(stats).toMatchObject({ loaded: 10, total: 30 });
  });

  it("asks Riot for no new games when the view may not load more", async () => {
    savedList = { matchIds: ["NA1_3", "NA1_2", "NA1_1"], fetchedAt: profileUpdatedAt };
    wholeGames = [saved("NA1_1", "LeeSin")];

    const stats = await loadSeasonStats("na", "player-2", profileUpdatedAt, null, {
      loadMore: false,
    });

    // A tab or "Show 10 more games" URL shows the saved games only.
    expect(getMatch).not.toHaveBeenCalled();
    expect(stats).toMatchObject({ loaded: 1, total: 3 });
    expect(stats?.champions.map((c) => c.championName)).toEqual(["LeeSin"]);
  });

  it("leaves a game Riot can't send for next time", async () => {
    savedList = { matchIds: ["NA1_2", "NA1_1"], fetchedAt: profileUpdatedAt };
    vi.mocked(getMatch).mockImplementation(async (_region, id) => {
      if (id === "NA1_2") throw new RiotApiError("unavailable", "down");
      return newMatch(id);
    });

    const stats = await loadSeasonStats("na", "player-2", profileUpdatedAt, null, plainPage);

    expect(writtenGames.map((g) => g.matchId)).toEqual(["NA1_1"]);
    expect(stats).toMatchObject({ loaded: 1, total: 2 });
  });

  it("lists the season again, page by page, once the profile is newer", async () => {
    savedList = { matchIds: ["NA1_old"], fetchedAt: new Date("2026-02-01T00:00:00Z") };
    const fullPage = Array.from({ length: 100 }, (_, i) => `NA1_${i + 10}`);
    vi.mocked(getMatchIds).mockResolvedValueOnce(fullPage).mockResolvedValueOnce(["NA1_1"]);

    const stats = await loadSeasonStats("na", "player-2", profileUpdatedAt, null, plainPage);

    expect(getMatchIds).toHaveBeenCalledTimes(2);
    expect(vi.mocked(getMatchIds).mock.calls[1][3]).toMatchObject({ start: 100 });
    expect(writtenLists).toEqual([[...fullPage, "NA1_1"]]);
    expect(stats?.total).toBe(101);
  });

  it("keeps the old list when Riot can't be reached", async () => {
    savedList = { matchIds: ["NA1_1"], fetchedAt: new Date("2026-02-01T00:00:00Z") };
    wholeGames = [saved("NA1_1")];
    vi.mocked(getMatchIds).mockRejectedValue(new RiotApiError("unavailable", "down"));

    const stats = await loadSeasonStats("na", "player-2", profileUpdatedAt, null, plainPage);

    expect(stats).toMatchObject({ loaded: 1, total: 1 });
  });

  // JAS-41: the season list belongs to the region the profile is saved for.
  // Opening the player on another region's page mustn't save that region's
  // list over it, or show the saved one as this region's.
  it("neither uses nor saves the season list on another region's page", async () => {
    savedRegion = "euw";
    savedList = { matchIds: ["EUW1_1"], fetchedAt: new Date("2026-03-02T00:00:00Z") };
    vi.mocked(getMatchIds).mockResolvedValue(["NA1_1"]);

    const stats = await loadSeasonStats("na", "player-2", profileUpdatedAt, null, plainPage);

    expect(stats?.total).toBe(1);
    expect(getMatchIds).toHaveBeenCalledOnce();
    expect(writtenLists).toEqual([]);
  });

  it("returns null without a database to remember games in", async () => {
    hasDatabase = false;
    expect(await loadSeasonStats("na", "player-2", profileUpdatedAt, null, plainPage)).toBeNull();
    expect(getMatchIds).not.toHaveBeenCalled();
  });
});

describe("syncSeasons", () => {
  const jaspy = { puuid: "player-2", region: "na", name: "Jaspy", tag: "CA1" };
  const friend = { puuid: "player-3", region: "na", name: "Friend", tag: "NA1" };
  const ids = (n: number, prefix = "NA1_") => Array.from({ length: n }, (_, i) => `${prefix}${n - i}`);

  it("brings a saved list up to date with one call and saves the newest missing games", async () => {
    tracked = [jaspy];
    savedList = { matchIds: ["NA1_1"], fetchedAt: new Date(Date.now() - 1000) };
    wholeGames = [saved("NA1_1")];
    vi.mocked(getMatchIds).mockResolvedValueOnce(["NA1_3", "NA1_2", "NA1_1"]);

    const results = await syncSeasons();

    expect(getMatchIds).toHaveBeenCalledTimes(1);
    expect(writtenLists).toEqual([["NA1_3", "NA1_2", "NA1_1"]]);
    expect(writtenGames.map((g) => g.matchId)).toEqual(["NA1_3", "NA1_2"]);
    expect(results).toEqual([{ player: "Jaspy#CA1", saved: 2, left: 0, error: null }]);
  });

  it("asks for the whole list again after 100 or more new games, and counts those calls", async () => {
    tracked = [jaspy];
    savedList = { matchIds: ["NA1_old"], fetchedAt: new Date(Date.now() - 1000) };
    const newest = ids(100);
    vi.mocked(getMatchIds)
      .mockResolvedValueOnce(newest) // the newest page: all new
      .mockResolvedValueOnce(newest) // the whole list, page 1
      .mockResolvedValueOnce(["NA1_old"]); // and page 2

    const results = await syncSeasons();

    expect(getMatchIds).toHaveBeenCalledTimes(3);
    expect(writtenLists).toEqual([[...newest, "NA1_old"]]);
    // Three calls went on the list, so 57 are left for games.
    expect(getMatch).toHaveBeenCalledTimes(SYNC_CALLS - 3);
    expect(results).toEqual([{ player: "Jaspy#CA1", saved: SYNC_CALLS - 3, left: 101 - 57, error: null }]);
  });

  it("shares the calls, so one long backlog doesn't hold up another player's new games", async () => {
    tracked = [jaspy, friend];
    vi.mocked(getMatchIds).mockImplementation(async (_region, puuid) =>
      puuid === jaspy.puuid ? ids(75) : ids(3, "NA1_f"),
    );

    const results = await syncSeasons();

    // One call each for the lists, then 58 for games.
    expect(getMatchIds).toHaveBeenCalledTimes(2);
    expect(getMatch).toHaveBeenCalledTimes(SYNC_CALLS - 2);
    // The order turns by one player each day, so it isn't checked here.
    expect(results).toHaveLength(2);
    expect(results).toEqual(
      expect.arrayContaining([
        { player: "Jaspy#CA1", saved: 55, left: 20, error: null },
        { player: "Friend#NA1", saved: 3, left: 0, error: null },
      ]),
    );
  });

  it("says why games were left when Riot stops answering", async () => {
    tracked = [jaspy];
    vi.mocked(getMatchIds).mockResolvedValue(["NA1_2", "NA1_1"]);
    vi.mocked(getMatch).mockRejectedValue(
      new RiotApiError("rate-limited", "Rate limited by Riot", 60),
    );

    const results = await syncSeasons();

    expect(results).toEqual([
      { player: "Jaspy#CA1", saved: 0, left: 2, error: "Rate limited by Riot" },
    ]);
  });

  it("keeps the saved list when Riot can't send the newest page, and says why", async () => {
    tracked = [jaspy];
    savedList = { matchIds: ["NA1_2", "NA1_1"], fetchedAt: new Date(Date.now() - 1000) };
    vi.mocked(getMatchIds).mockRejectedValue(new RiotApiError("unavailable", "down"));

    const results = await syncSeasons();

    expect(writtenGames.map((g) => g.matchId)).toEqual(["NA1_2", "NA1_1"]);
    expect(results).toEqual([{ player: "Jaspy#CA1", saved: 2, left: 0, error: "down" }]);
  });

  it("reports a rejected key even when every game is already in", async () => {
    tracked = [jaspy];
    savedList = { matchIds: ["NA1_1"], fetchedAt: new Date(Date.now() - 1000) };
    wholeGames = [saved("NA1_1")];
    vi.mocked(getMatchIds).mockRejectedValue(
      new RiotApiError("bad-key", "Riot rejected the API key (403)"),
    );

    const results = await syncSeasons();

    expect(getMatch).not.toHaveBeenCalled();
    expect(results).toEqual([
      { player: "Jaspy#CA1", saved: 0, left: 0, error: "Riot rejected the API key (403)" },
    ]);
  });

  it("saves an unchanged list again, so the profile sees it's fresh", async () => {
    tracked = [jaspy];
    savedList = { matchIds: ["NA1_1"], fetchedAt: new Date(Date.now() - 1000) };
    wholeGames = [saved("NA1_1")];
    vi.mocked(getMatchIds).mockResolvedValueOnce(["NA1_1"]);

    await syncSeasons();

    expect(writtenLists).toEqual([["NA1_1"]]);
  });

  it("leaves a player for tomorrow when the lists use up every call", async () => {
    // Seven new players with 1,000 games each: 10 calls per list, so the
    // seventh list doesn't fit, and no calls are left for games.
    tracked = Array.from({ length: 7 }, (_, i) => ({ ...jaspy, puuid: `p${i}`, name: `P${i}` }));
    vi.mocked(getMatchIds).mockResolvedValue(ids(100));

    const results = await syncSeasons();

    expect(getMatchIds).toHaveBeenCalledTimes(SYNC_CALLS);
    expect(getMatch).not.toHaveBeenCalled();
    const waiting = results.filter((r) => r.left === null);
    expect(waiting).toHaveLength(1);
    // Not an error, so it doesn't reach Sentry.
    expect(waiting[0]).toMatchObject({ saved: 0, error: null });
  });

  it("starts one player further along each day, so it isn't always the same player who waits", async () => {
    tracked = Array.from({ length: 7 }, (_, i) => ({ ...jaspy, puuid: `p${i}`, name: `P${i}` }));
    vi.mocked(getMatchIds).mockResolvedValue(ids(100));
    const waiter = async (day: number) => {
      vi.setSystemTime(Date.UTC(2026, 9, day, 9));
      return (await syncSeasons()).find((r) => r.left === null)?.player;
    };

    try {
      expect(await waiter(29)).not.toBe(await waiter(30));
    } finally {
      vi.useRealTimers();
    }
  });

  it("skips a player saved with an unknown region", async () => {
    tracked = [{ ...jaspy, region: "moon" }];
    expect(await syncSeasons()).toEqual([]);
    expect(getMatchIds).not.toHaveBeenCalled();
  });

  it("does nothing without a database", async () => {
    hasDatabase = false;
    expect(await syncSeasons()).toEqual([]);
  });
});

describe("fairShares", () => {
  it("gives every player their missing games while the calls last", () => {
    expect(fairShares([3, 2], 10)).toEqual([3, 2]);
  });

  it("splits the calls in turn when there aren't enough", () => {
    expect(fairShares([700, 3, 10], 20)).toEqual([9, 3, 8]);
  });

  it("gives nothing with no calls left", () => {
    expect(fairShares([5, 5], 0)).toEqual([0, 0]);
  });
});
