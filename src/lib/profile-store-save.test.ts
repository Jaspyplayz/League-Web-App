import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { tables } from "@/db";
import { getMatchIds, getRankedEntries, getSummoner } from "@/lib/riot/api";
import { RiotApiError, type RiotErrorKind } from "@/lib/riot/client";
import type { LeagueEntry } from "@/lib/riot/types";
import { loadProfile, updateProfile } from "./profile-store";

vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/riot/api", () => ({
  getSummoner: vi.fn(),
  getRankedEntries: vi.fn(),
  getMatchIds: vi.fn(),
}));

// profile-store.test.ts covers reading; this file covers what a visit saves.
// The pretend database keeps one player row, its rank rows and its rank
// history, and applies writes the way Postgres would. An upsert's `setWhere`
// is read from its SQL, so the region check is the real one.
type Row = Record<string, unknown>;
let player: Row | undefined;
let ranked: Row[];
let history: Row[];

const dialect = new PgDialect();

function upsert(values: Row, config: { set: Row; setWhere?: SQL }): Row[] {
  // Returns the whole row, which .returning() narrows in Postgres.
  if (!player) {
    player = { ...values };
    return [{ ...player }];
  }
  if (config.setWhere) {
    // The two conditions saveProfile writes: the saved region only, or the
    // saved region or a saved row with no summoner.
    const { sql, params } = dialect.sqlToQuery(config.setWhere);
    const ours = player.region === params[0];
    if (sql === '"players"."region" = $1') {
      if (!ours) return [];
    } else {
      expect(sql).toBe('("players"."region" = $1 or "players"."summoner_level" is null)');
      if (!ours && player.summonerLevel !== null) return [];
    }
  }
  player = { ...player, ...config.set };
  return [{ ...player }];
}

const tx = {
  insert: (table: unknown) => ({
    values: (values: Row | Row[]) => {
      if (table === tables.rankedEntries) {
        ranked.push(...(values as Row[]));
        return Promise.resolve();
      }
      return {
        onConflictDoUpdate: (config: { set: Row; setWhere?: SQL }) => {
          // Awaited directly or through .returning(), as the code chooses.
          let result: Row[] | undefined;
          const run = () => (result ??= upsert(values as Row, config));
          return {
            returning: async () => run(),
            then: (resolve: (value: unknown) => void, reject: (error: unknown) => void) => {
              try {
                run();
                resolve(undefined);
              } catch (error) {
                reject(error);
              }
            },
          };
        },
      };
    },
  }),
  delete: (table: unknown) => ({
    where: async () => {
      if (table === tables.rankedEntries) ranked = [];
    },
  }),
  // Only the rename on another region's visit updates a player row.
  update: (table: unknown) => ({
    set: (values: Row) => ({
      where: async () => {
        expect(table).toBe(tables.players);
        expect(Object.keys(values).sort()).toEqual(["gameName", "tagLine"]);
        if (player) player = { ...player, ...values };
      },
    }),
  }),
};
const fakeDb = {
  ...tx,
  transaction: async (run: (t: typeof tx) => Promise<unknown>) => run(tx),
  query: {
    players: { findFirst: async () => player },
    rankedEntries: { findMany: async () => ranked },
  },
  select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => [] }) }) }) }),
  insert: (table: unknown) =>
    table === tables.rankHistory
      ? { values: async (rows: Row[]) => void history.push(...rows) }
      : tx.insert(table),
};
vi.mock("@/lib/match-store", () => ({
  database: () => fakeDb,
  readCache: (read: (db: typeof fakeDb) => unknown) => read(fakeDb),
}));

const account = { puuid: "p1", gameName: "Jasper", tagLine: "NA1" };
const dayAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);
const gold: LeagueEntry = {
  queueType: "RANKED_SOLO_5x5",
  tier: "GOLD",
  rank: "II",
  leaguePoints: 40,
  wins: 10,
  losses: 8,
} as LeagueEntry;
const euwRank = { puuid: "p1", queueType: "RANKED_SOLO_5x5", tier: "DIAMOND", rank: "I", leaguePoints: 75, wins: 90, losses: 70 };

function saveEuwProfile(fetchedAt = new Date()) {
  player = {
    ...account,
    region: "euw",
    profileIconId: 1,
    summonerLevel: 300,
    matchIds: ["EUW1_saved"],
    fetchedAt,
    rankedFetchedAt: fetchedAt,
    matchIdsFetchedAt: fetchedAt,
  };
  ranked = [{ ...euwRank }];
}

beforeEach(() => {
  player = undefined;
  ranked = [];
  history = [];
  vi.mocked(getSummoner).mockReset().mockResolvedValue({ puuid: "p1", profileIconId: 7, summonerLevel: 12 });
  vi.mocked(getRankedEntries).mockReset().mockResolvedValue([gold]);
  vi.mocked(getMatchIds).mockReset().mockResolvedValue(["NA1_new"]);
});

// GitHub issue #150 and JAS-41: Riot accounts are global, so the same player
// can be opened on any region's page.
describe("a visit on another region than the saved profile's", () => {
  it("shows what that region returned, marked as not the saved profile", async () => {
    saveEuwProfile();
    const profile = await loadProfile("na", account);
    expect(profile.matchIds).toEqual(["NA1_new"]);
    expect(profile.ranked).toEqual([gold]);
    expect(profile.stored).toBe(false);
  });

  it("keeps the saved region and match ids", async () => {
    saveEuwProfile();
    await loadProfile("na", account);
    expect(player).toMatchObject({ region: "euw", matchIds: ["EUW1_saved"], summonerLevel: 300 });
  });

  it("keeps the saved ranks, and adds nothing to the rank history", async () => {
    saveEuwProfile();
    await loadProfile("na", account);
    expect(ranked).toEqual([euwRank]);
    expect(history).toEqual([]);
  });

  // The cooldown comes from the saved row, which this page never moves on,
  // so asking Riot here would let anyone click without a cooldown.
  it("changes nothing through the Update button either, and asks Riot nothing", async () => {
    saveEuwProfile(dayAgo);
    expect(await updateProfile("na", "p1")).toEqual({ status: "updated" });
    expect(player).toMatchObject({ region: "euw", matchIds: ["EUW1_saved"] });
    expect(ranked).toEqual([euwRank]);
    expect(getSummoner).not.toHaveBeenCalled();
    expect(getRankedEntries).not.toHaveBeenCalled();
    expect(getMatchIds).not.toHaveBeenCalled();
  });

  it("still saves a rename, since Riot IDs are global", async () => {
    saveEuwProfile();
    await loadProfile("na", { ...account, gameName: "Jaspy", tagLine: "CA1" });
    expect(player).toMatchObject({ gameName: "Jaspy", tagLine: "CA1", region: "euw", matchIds: ["EUW1_saved"] });
  });
});

// The search box starts on NA, so a EUW player's first visit can land on NA,
// where Riot has no summoner for them. That row mustn't stick for good.
describe("a saved row from a server the player never played on", () => {
  function saveEmptyNaRow(fetchedAt = new Date()) {
    player = { ...account, region: "na", profileIconId: null, summonerLevel: null, matchIds: [], fetchedAt, rankedFetchedAt: fetchedAt, matchIdsFetchedAt: fetchedAt };
    ranked = [];
  }

  it("is replaced by a visit to a region that finds their summoner", async () => {
    saveEmptyNaRow();
    vi.mocked(getMatchIds).mockResolvedValue(["EUW1_real"]);
    const profile = await loadProfile("euw", account);
    expect(player).toMatchObject({ region: "euw", summonerLevel: 12, matchIds: ["EUW1_real"] });
    expect(ranked).toMatchObject([{ tier: "GOLD" }]);
    expect(history).toMatchObject([{ tier: "GOLD" }]);
    expect(profile.stored).toBe(true);
  });

  // The page fetches EUW again when it reloads, and that visit replaces the
  // row, so the click itself has nothing to do (JAS-71).
  it("is replaced on the reload after Update, not by the click, which asks Riot nothing", async () => {
    saveEmptyNaRow(dayAgo);
    expect(await updateProfile("euw", "p1")).toEqual({ status: "updated" });
    expect(getSummoner).not.toHaveBeenCalled();
    expect(getRankedEntries).not.toHaveBeenCalled();
    expect(getMatchIds).not.toHaveBeenCalled();
    expect(player).toMatchObject({ region: "na", summonerLevel: null });
    await loadProfile("euw", account);
    expect(player).toMatchObject({ region: "euw", summonerLevel: 12 });
  });

  it("isn't replaced by another region with no summoner either", async () => {
    saveEmptyNaRow();
    vi.mocked(getSummoner).mockRejectedValue(new RiotApiError("not-found", "no summoner on KR"));
    await loadProfile("kr", account);
    expect(player).toMatchObject({ region: "na", summonerLevel: null });
  });

  // Passes on main too (the region check blocks it either way), so it only
  // guards against a regression.
  it("isn't replaced when Riot fails to answer about the summoner", async () => {
    saveEmptyNaRow();
    vi.mocked(getSummoner).mockRejectedValue(new RiotApiError("unavailable", "summoner-v4 is down"));
    vi.mocked(getMatchIds).mockResolvedValue(["EUW1_real"]);
    const profile = await loadProfile("euw", account);
    expect(player).toMatchObject({ region: "na", summonerLevel: null, matchIds: [] });
    expect(profile).toMatchObject({ matchIds: ["EUW1_real"], stored: false });
  });
});

// JAS-71: a saved level of null means "no summoner on this server", which
// lets another server take the row, so only Riot's "not found" may save one.
describe("a summoner call that fails for another reason than not found", () => {
  const fail = (kind: RiotErrorKind = "unavailable") =>
    vi.mocked(getSummoner).mockRejectedValue(new RiotApiError(kind, "summoner-v4 failed"));

  it("keeps the saved icon and level, and saves the fresh ranks and games", async () => {
    saveEuwProfile(dayAgo);
    fail();
    vi.mocked(getMatchIds).mockResolvedValue(["EUW1_new"]);
    const profile = await loadProfile("euw", account);
    expect(player).toMatchObject({ region: "euw", profileIconId: 1, summonerLevel: 300, matchIds: ["EUW1_new"] });
    expect(ranked).toMatchObject([{ tier: "GOLD" }]);
    expect(profile).toMatchObject({ profileIconId: 1, summonerLevel: 300, matchIds: ["EUW1_new"], stored: true });
  });

  it.each(["unavailable", "rate-limited", "bad-key"] as const)(
    "so another server with a summoner can't take the row afterwards (%s)",
    async (kind) => {
      saveEuwProfile(dayAgo);
      fail(kind);
      await loadProfile("euw", account);
      vi.mocked(getSummoner).mockResolvedValue({ puuid: "p1", profileIconId: 7, summonerLevel: 12 });
      await loadProfile("na", account);
      expect(player).toMatchObject({ region: "euw", summonerLevel: 300 });
    },
  );

  it("still saves a first visit, and the next visit that reaches Riot fills in the level", async () => {
    fail();
    const profile = await loadProfile("na", account);
    expect(player).toMatchObject({ region: "na", summonerLevel: null, matchIds: ["NA1_new"] });
    expect(profile).toMatchObject({ summonerLevel: null, stored: true });
    vi.mocked(getSummoner).mockResolvedValue({ puuid: "p1", profileIconId: 7, summonerLevel: 12 });
    player = { ...player, matchIdsFetchedAt: dayAgo };
    await loadProfile("na", account);
    expect(player).toMatchObject({ region: "na", summonerLevel: 12 });
  });

  it("lets Update save the fresh ranks and games, which starts the cooldown", async () => {
    saveEuwProfile(dayAgo);
    fail();
    vi.mocked(getMatchIds).mockResolvedValue(["EUW1_new"]);
    expect(await updateProfile("euw", "p1")).toEqual({ status: "updated" });
    expect(player).toMatchObject({ summonerLevel: 300, matchIds: ["EUW1_new"] });
    expect((await updateProfile("euw", "p1")).status).toBe("cooldown");
  });
});

describe("a visit on the saved profile's region", () => {
  it("updates a day-old profile, ranks included", async () => {
    saveEuwProfile(dayAgo);
    vi.mocked(getMatchIds).mockResolvedValue(["EUW1_new"]);
    await loadProfile("euw", account);
    expect(player).toMatchObject({ region: "euw", matchIds: ["EUW1_new"], summonerLevel: 12 });
    expect(ranked).toMatchObject([{ puuid: "p1", tier: "GOLD", leaguePoints: 40 }]);
    expect(history).toMatchObject([{ puuid: "p1", tier: "GOLD" }]);
  });

  // Decision record 0021's repair starts from this row, so "not found" must
  // still save one.
  it("saves a first visit with no summoner as a row with no level", async () => {
    vi.mocked(getSummoner).mockRejectedValue(new RiotApiError("not-found", "no summoner on NA"));
    expect((await loadProfile("na", account)).stored).toBe(true);
    expect(player).toMatchObject({ region: "na", summonerLevel: null, profileIconId: null });
  });

  it("saves a not-found summoner over a saved level through Update", async () => {
    saveEuwProfile(dayAgo);
    vi.mocked(getSummoner).mockRejectedValue(new RiotApiError("not-found", "summoner gone"));
    expect(await updateProfile("euw", "p1")).toEqual({ status: "updated" });
    expect(player).toMatchObject({ region: "euw", summonerLevel: null });
  });

  it("saves the first visit to a player", async () => {
    expect((await loadProfile("na", account)).stored).toBe(true);
    expect(player).toMatchObject({ puuid: "p1", region: "na", matchIds: ["NA1_new"] });
    expect(ranked).toMatchObject([{ puuid: "p1", tier: "GOLD" }]);
  });
});
