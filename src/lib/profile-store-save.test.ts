import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { tables } from "@/db";
import { getMatchIds, getRankedEntries, getSummoner } from "@/lib/riot/api";
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
  if (!player) {
    player = { ...values };
    return [{ puuid: values.puuid }];
  }
  if (config.setWhere) {
    const { sql, params } = dialect.sqlToQuery(config.setWhere);
    expect(sql).toBe('"players"."region" = $1');
    if (player.region !== params[0]) return [];
  }
  player = { ...player, ...config.set };
  return [{ puuid: player.puuid }];
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
  it("shows what that region returned", async () => {
    saveEuwProfile();
    const profile = await loadProfile("na", account);
    expect(profile.matchIds).toEqual(["NA1_new"]);
    expect(profile.ranked).toEqual([gold]);
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

  it("changes nothing through the Update button either", async () => {
    saveEuwProfile(dayAgo);
    expect(await updateProfile("na", "p1")).toEqual({ status: "updated" });
    expect(player).toMatchObject({ region: "euw", matchIds: ["EUW1_saved"] });
    expect(ranked).toEqual([euwRank]);
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

  it("saves the first visit to a player", async () => {
    await loadProfile("na", account);
    expect(player).toMatchObject({ puuid: "p1", region: "na", matchIds: ["NA1_new"] });
    expect(ranked).toMatchObject([{ puuid: "p1", tier: "GOLD" }]);
  });
});
