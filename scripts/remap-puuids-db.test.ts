// Needs a throwaway database with the migrations applied and a stub of
// Supabase's auth.users, so it's skipped unless REMAP_TEST_DATABASE_URL points
// at one (docs/database.md, "When the Riot key changes").

import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql, type SQL } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db";
import { matchRow, participantRows } from "@/db/rows";
import * as schema from "@/db/schema";
import { REGIONS } from "@/lib/regions";
import { RiotApiError } from "@/lib/riot/client";
import type { Match } from "@/lib/riot/types";
import { game, names, puuid, type GameSpec, type Key } from "./remap-puuids-fixtures";
import {
  apply,
  ApplyCheckError,
  cleanUp,
  dryRun,
  KeyCheckError,
  readMapFile,
  rollback,
  TOUCHED,
  type FetchMatch,
} from "./remap-puuids-db";
import { BOT_PUUID, findOldPuuids, type MapFile } from "./remap-puuids-map";

vi.mock("server-only", () => ({}));

const url = process.env.REMAP_TEST_DATABASE_URL;

const OLD_AT = new Date("2026-10-20T12:00:00Z");
const NEW_AT = new Date("2026-10-24T12:00:00Z");
const U1 = "00000000-0000-4000-8000-000000000001";
const U2 = "00000000-0000-4000-8000-000000000002";
const old = (name: string) => puuid("old", name);
const now = (name: string) => puuid("new", name);

const g1: GameSpec = {
  matchId: "NA1_1001",
  platformId: "NA1",
  players: ["jaspy", "carl", ...names("p", 8)],
  startedAt: "2026-10-19T20:00:00Z",
};
const g2: GameSpec = {
  matchId: "KR_2001",
  platformId: "KR",
  players: ["faker", ...names("q", 9)],
  startedAt: "2026-10-19T12:00:00Z",
};
const arena: GameSpec = {
  matchId: "NA1_1002",
  platformId: "NA1",
  players: ["jaspy", ...names("r", 15)],
  startedAt: "2026-10-18T20:00:00Z",
  queueId: 1700,
};
const bots: GameSpec = {
  matchId: "NA1_1003",
  platformId: "NA1",
  players: ["jaspy", "carl", "b1", "b2", "b3", ...Array<string>(5).fill(BOT_PUUID)],
  startedAt: "2026-10-17T20:00:00Z",
  humansOnlyInMetadata: true,
};
const missing: GameSpec = {
  matchId: "NA1_1004",
  platformId: "NA1",
  players: ["carl", ...names("m", 9)],
  startedAt: "2026-10-16T20:00:00Z",
};
const mismatch: GameSpec = {
  matchId: "KR_2002",
  platformId: "KR",
  players: ["faker", ...names("n", 9)],
  startedAt: "2026-10-15T12:00:00Z",
};
const conflict: GameSpec = {
  matchId: "NA1_1005",
  platformId: "NA1",
  players: ["p1", ...names("s", 9)],
  startedAt: "2026-10-14T20:00:00Z",
};
const recent1: GameSpec = {
  matchId: "NA1_9001",
  platformId: "NA1",
  players: ["jaspy", ...names("t", 9)],
  startedAt: "2026-10-24T10:00:00Z",
};
const recent2: GameSpec = {
  matchId: "KR_9002",
  platformId: "KR",
  players: ["faker", ...names("u", 9)],
  startedAt: "2026-10-24T11:00:00Z",
};
const OLD_GAMES = [g1, g2, arena, bots, missing, mismatch, conflict];
const RECENT = [recent1, recent2];

function riotCopy(spec: GameSpec): Match {
  if (spec === mismatch) return game(spec, "new", { champions: { 3: 999 } });
  if (spec === conflict) return game(spec, "new", { puuids: { p1: now("p1-elsewhere") } });
  return game(spec, "new");
}

function savedCopy(spec: GameSpec): Match {
  return game(spec, RECENT.includes(spec) ? "new" : "old");
}

function fakeRiot(key: "new" | "old") {
  const calls: string[] = [];
  const fetchMatch: FetchMatch = async (region, matchId) => {
    calls.push(matchId);
    const spec = [...OLD_GAMES, ...RECENT].find((s) => s.matchId === matchId);
    if (!spec) throw new RiotApiError("not-found", "Not found");
    expect(REGIONS[region].platform).toBe(spec.platformId.toLowerCase());
    if (spec === missing) throw new RiotApiError("not-found", "Not found");
    return key === "old" ? savedCopy(spec) : riotCopy(spec);
  };
  return { fetchMatch, calls };
}

const TABLES = [
  "players",
  "ranked_entries",
  "rank_history",
  "player_seasons",
  "user_players",
  "matches",
  "match_participants",
  "match_recaps",
  "ask_questions",
  "match_insights",
  "benchmark_games",
];

async function snapshot(db: Db) {
  const tables: Record<string, unknown[]> = {};
  for (const table of TABLES) {
    const rows = await db.execute<{ row: unknown }>(
      sql`select to_jsonb(t) as row from ${sql.identifier(table)} t order by to_jsonb(t)::text`,
    );
    tables[table] = rows.map((r) => r.row);
  }
  return tables;
}

async function rowsOf<T extends Record<string, unknown>>(db: Db, query: SQL) {
  return [...(await db.execute<T>(query))];
}

async function seed(db: Db) {
  await db.execute(sql`truncate players, matches, benchmark_games, ask_questions, auth.users cascade`);
  await db.execute(sql`insert into auth.users (id) values (${U1}), (${U2})`);

  for (const spec of [...OLD_GAMES, ...RECENT]) {
    const match = savedCopy(spec);
    const fetchedAt = spec === recent2 ? new Date("2026-10-24T13:00:00Z") : RECENT.includes(spec) ? NEW_AT : OLD_AT;
    await db.insert(schema.matches).values({ ...matchRow(match), fetchedAt });
    // The bots share one PUUID and collapse into one row, as in saveMatch.
    await db.insert(schema.matchParticipants).values(participantRows(match)).onConflictDoNothing();
  }

  const player = (id: string, gameName: string, tagLine: string, region: string, fetchedAt: Date) => ({
    puuid: id,
    gameName,
    tagLine,
    region,
    profileIconId: 1,
    summonerLevel: 100,
    fetchedAt,
    rankedFetchedAt: fetchedAt,
    matchIdsFetchedAt: fetchedAt,
    matchIds: [g1.matchId],
  });
  await db.insert(schema.players).values([
    player(old("jaspy"), "Jaspy", "CA1", "na", OLD_AT),
    player(old("faker"), "Hide on bush", "KR1", "kr", OLD_AT),
    player(old("carl"), "Carl", "NA1", "na", OLD_AT),
    player(old("p1"), "Pone", "NA1", "na", OLD_AT),
    player(now("jaspy"), "Jaspy", "CA1", "na", NEW_AT),
    player(now("faker"), "Hide on bush", "KR1", "kr", NEW_AT),
  ]);

  const rank = (id: string, queueType: string, tier: string, fetchedAt: Date) => ({
    puuid: id,
    queueType,
    tier,
    rank: "I",
    leaguePoints: 50,
    wins: 10,
    losses: 9,
    fetchedAt,
  });
  await db.insert(schema.rankedEntries).values([
    rank(old("jaspy"), "RANKED_SOLO_5x5", "GOLD", OLD_AT),
    rank(old("jaspy"), "RANKED_FLEX_SR", "SILVER", OLD_AT),
    rank(now("jaspy"), "RANKED_SOLO_5x5", "PLATINUM", NEW_AT),
    rank(old("faker"), "RANKED_SOLO_5x5", "CHALLENGER", OLD_AT),
    rank(old("carl"), "RANKED_SOLO_5x5", "BRONZE", OLD_AT),
    rank(old("p1"), "RANKED_SOLO_5x5", "IRON", OLD_AT),
  ]);

  // Microseconds, which a JavaScript Date would drop: rank_history's key
  // includes recorded_at, so they have to survive the move.
  await db.execute(sql`
    insert into rank_history (puuid, queue_type, tier, rank, league_points, wins, losses, recorded_at) values
      (${old("jaspy")}, 'RANKED_SOLO_5x5', 'GOLD', 'II', 10, 5, 5, '2026-10-01T10:00:00.123456Z'),
      (${old("jaspy")}, 'RANKED_SOLO_5x5', 'GOLD', 'I', 60, 8, 6, '2026-10-10T10:00:00.654321Z'),
      (${now("jaspy")}, 'RANKED_SOLO_5x5', 'PLATINUM', 'IV', 0, 10, 9, '2026-10-24T12:00:00Z'),
      (${old("carl")}, 'RANKED_SOLO_5x5', 'BRONZE', 'I', 99, 3, 4, '2026-10-05T00:00:00.000001Z')`);

  await db.insert(schema.playerSeasons).values([
    { puuid: old("jaspy"), season: "2026", matchIds: [g1.matchId, arena.matchId], fetchedAt: OLD_AT },
    { puuid: now("jaspy"), season: "2026", matchIds: [recent1.matchId, g1.matchId], fetchedAt: NEW_AT },
    { puuid: old("carl"), season: "2026", matchIds: [g1.matchId, bots.matchId, missing.matchId], fetchedAt: OLD_AT },
  ]);

  await db.insert(schema.userPlayers).values([
    { userId: U1, puuid: old("carl") },
    { userId: U2, puuid: now("jaspy") },
  ]);

  const recap = (matchId: string, id: string, headline: string) => ({
    matchId,
    puuid: id,
    headline,
    detail: `${headline}, in detail.`,
    model: "claude-haiku",
    createdBy: U1,
  });
  await db.insert(schema.matchRecaps).values([
    recap(g1.matchId, old("jaspy"), "Jaspy recap"),
    recap(g2.matchId, old("faker"), "Faker recap"),
    recap(g1.matchId, old("carl"), "Carl old recap"),
    recap(g1.matchId, now("carl"), "Carl new recap"),
  ]);

  await db.insert(schema.askQuestions).values({
    userId: U2,
    puuid: old("jaspy"),
    question: "Why do I lose lane?",
    answer: "You back late.",
    games: [{ matchId: g1.matchId, label: "Ahri" }],
    model: "claude-sonnet",
    costMicros: 1234,
  });

  const insight = (matchId: string, id: string, opponent: string, version: number) => ({
    matchId,
    puuid: id,
    opponentPuuid: opponent,
    goldDiffAt10: 250,
    version,
  });
  await db.insert(schema.matchInsights).values([
    insight(g1.matchId, old("jaspy"), old("carl"), 1),
    insight(g2.matchId, old("faker"), old("q1"), 1),
    insight(g2.matchId, now("faker"), now("q1"), 2),
    insight(missing.matchId, old("m1"), old("carl"), 1),
  ]);

  const benchmark = (matchId: string, id: string, collectedAt: Date) => ({
    matchId,
    puuid: id,
    region: "na",
    tier: "GOLD",
    gameStartAt: OLD_AT,
    championName: "Ahri",
    position: "MIDDLE",
    win: true,
    earlyDeaths: [],
    csPerMinEarly: 7.5,
    collectedAt,
  });
  await db.insert(schema.benchmarkGames).values([
    benchmark("NA1_5001", old("bench1"), new Date("2026-10-01T00:00:00Z")),
    benchmark("NA1_5002", old("bench2"), new Date("2026-10-01T00:00:00Z")),
    benchmark("NA1_5003", old("bench1"), new Date("2026-10-02T00:00:00Z")),
    benchmark("NA1_5004", now("bench9"), NEW_AT),
  ]);
}

function expectedRaw(spec: GameSpec): Match {
  if (spec === g1 || spec === conflict) return withPuuids(game(spec, "new"), spec, ["p1"], "old");
  if (spec === missing) return withPuuids(game(spec, "old"), spec, ["carl"], "new");
  if (spec === mismatch) return withPuuids(game(spec, "old"), spec, ["faker"], "new");
  return riotCopy(spec);
}

function withPuuids(match: Match, spec: GameSpec, players: string[], key: Key): Match {
  const listed = (match.metadata as { participants?: string[] }).participants!;
  for (const name of players) {
    const slot = match.info.participants[spec.players.indexOf(name)];
    listed[listed.indexOf(slot.puuid)] = puuid(key, name);
    slot.puuid = puuid(key, name);
  }
  return match;
}

it("lists every table after the tables it points at, so rollback restores parents first", () => {
  const names = TOUCHED.map((t) => t.name);
  const outOfOrder = TOUCHED.flatMap((t, i) =>
    getTableConfig(t.table)
      .foreignKeys.map((fk) => getTableConfig(fk.reference().foreignTable).name)
      .filter((target) => names.indexOf(target) > i)
      .map((target) => `${t.name} -> ${target}`),
  );
  expect(outOfOrder).toEqual([]);
});

describe.skipIf(!url)("remap-puuids on a throwaway Postgres", () => {
  let db: Db;
  let dir: string;
  let mapPath: string;
  let file: MapFile;
  let beforeApply: Awaited<ReturnType<typeof snapshot>>;
  let backupFile: string;
  const log = () => {};

  beforeAll(async () => {
    if (!/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(url!)) {
      throw new Error("REMAP_TEST_DATABASE_URL must point at a local throwaway database");
    }
    db = drizzle({ client: postgres(url!, { prepare: false, max: 5, onnotice: () => {} }), schema });
    dir = mkdtempSync(join(tmpdir(), "remap-puuids-"));
    await seed(db);
  });

  afterAll(async () => {
    await db?.$client.end();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("stops before downloading the old games when the key is the old app's", async () => {
    const before = await snapshot(db);
    const riot = fakeRiot("old");
    const error = await dryRun({ db, fetchMatch: riot.fetchMatch, dir, log }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(KeyCheckError);
    expect((error as KeyCheckError).problems).toEqual([
      "20 of 20 PUUIDs in old games came back unchanged, so this key belongs to the old Riot app.",
      "Jaspy#CA1's old PUUID came back as a different PUUID from its new-key players row.",
      "Hide on bush#KR1's old PUUID came back as a different PUUID from its new-key players row.",
    ]);
    expect(riot.calls.sort()).toEqual([g1.matchId, g2.matchId, recent1.matchId, recent2.matchId].sort());
    expect(readdirSync(dir)).toEqual([]);
    expect(await snapshot(db)).toEqual(before);
  });

  it("maps every old player Riot sends back, and skips the rest with a reason", async () => {
    const before = await snapshot(db);
    const riot = fakeRiot("new");
    const result = await dryRun({ db, fetchMatch: riot.fetchMatch, dir, log });
    mapPath = result.path;
    file = readMapFile(mapPath);

    expect(result.counts).toEqual({
      matches: 9,
      oldMatches: 7,
      oldMatchesByHost: { americas: 5, asia: 2 },
      notTenPlayers: 1,
      slots: 71,
      distinctOldPuuids: 65,
      participantRows: 72,
      playersOld: 4,
      playersNew: 2,
      rankedOld: 5,
      rankHistoryOld: 3,
      seasonsOld: 2,
      userPlayersOld: 1,
      recapsOld: 3,
      insightsOld: 3,
      askOld: 1,
      benchmarkOld: 3,
    });

    const placed = ["jaspy", "carl", "faker", ...names("p", 8).slice(1), ...names("q", 9), ...names("r", 15), "b1", "b2", "b3", ...names("s", 9)];
    expect(new Map(file.map)).toEqual(new Map(placed.map((name) => [old(name), now(name)])));
    expect(file.skips).toHaveLength(3);
    expect(file.skips).toEqual(expect.arrayContaining([
      { kind: "missing", matchId: missing.matchId, reason: "Riot has no such game" },
      { kind: "mismatch", matchId: mismatch.matchId, reason: "participant 3 played champion 102, Riot's copy says 999" },
      {
        kind: "conflict",
        old: [old("p1")],
        new: [now("p1"), now("p1-elsewhere")],
        matchIds: [g1.matchId, conflict.matchId],
        reason: "one old PUUID came back as 2 different new ones",
      },
    ]));
    expect(file.oldPlayers.sort()).toEqual([old("carl"), old("faker"), old("jaspy"), old("p1")].sort());
    expect(await snapshot(db)).toEqual(before);
  });

  it("refuses a map file written for another cutoff", () => {
    const json = JSON.parse(readFileSync(mapPath, "utf8"));
    const other = join(dir, "other-cutoff.json");
    writeFileSync(other, JSON.stringify({ ...json, cutoff: "2026-10-23T09:00:00.000Z" }));
    expect(() => readMapFile(other)).toThrow("is for the cutoff 2026-10-23T09:00:00.000Z");
  });

  it("rolls the whole apply back when a check fails", async () => {
    await db.execute(sql`
      update matches set raw = jsonb_set(raw, '{info,note}', to_jsonb(${old("jaspy")}::text))
      where match_id = ${g1.matchId}`);
    const before = await snapshot(db);

    const error = await apply({ db, dir, log }, file, mapPath).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApplyCheckError);
    expect((error as ApplyCheckError).problems).toEqual([
      `1 games still have an old PUUID in their JSON, such as ${g1.matchId}.`,
    ]);
    expect(await snapshot(db)).toEqual(before);

    await db.execute(sql`update matches set raw = raw #- '{info,note}' where match_id = ${g1.matchId}`);
  });

  it("changes nothing when a row changes between the backup and the apply", async () => {
    let transactions = 0;
    const busy = new Proxy(db, {
      get(target, prop, receiver) {
        if (prop !== "transaction") return Reflect.get(target, prop, receiver);
        return async (...args: Parameters<Db["transaction"]>) => {
          if (++transactions === 2) {
            await target.insert(schema.matchRecaps).values({
              matchId: g2.matchId,
              puuid: old("q1"),
              headline: "Saved mid-apply",
              detail: "A visitor asked for it.",
              model: "claude-haiku",
            });
          }
          return target.transaction(...args);
        };
      },
    });
    const before = await snapshot(db);

    await expect(apply({ db: busy, dir, log }, file, mapPath)).rejects.toThrow(
      "match_recaps changed after the backup was written",
    );
    await db.execute(sql`delete from match_recaps where headline = 'Saved mid-apply'`);
    expect(await snapshot(db)).toEqual(before);
  });

  it("moves every row to the new PUUIDs, keeping the new row where both exist", async () => {
    beforeApply = await snapshot(db);
    const result = await apply({ db, dir, log }, file, mapPath);
    if (result.kind !== "applied") throw new Error(result.kind);
    backupFile = result.backupFile;

    expect(result.backedUp).toEqual({
      players: 3,
      ranked_entries: 4,
      player_seasons: 2,
      rank_history: 3,
      user_players: 1,
      matches: 7,
      match_recaps: 3,
      ask_questions: 1,
      match_insights: 3,
      match_participants: 51,
      benchmark_games: 3,
    });

    const unchangedNewRows = (table: string, id: string) =>
      beforeApply[table].filter((row) => (row as { puuid: string }).puuid === id);
    const players = await rowsOf<{ puuid: string; row: unknown }>(db, sql`select puuid, to_jsonb(p) as row from players p order by puuid`);
    expect(players.map((p) => p.puuid)).toEqual([now("carl"), now("faker"), now("jaspy"), old("p1")]);
    const oldCarl = beforeApply.players.find((row) => (row as { puuid: string }).puuid === old("carl"));
    expect(players[0].row).toEqual({ ...(oldCarl as object), puuid: now("carl") });
    expect(players[1].row).toEqual(unchangedNewRows("players", now("faker"))[0]);
    expect(players[2].row).toEqual(unchangedNewRows("players", now("jaspy"))[0]);

    expect(await rowsOf(db, sql`select puuid, queue_type, tier from ranked_entries order by puuid, queue_type`)).toEqual([
      { puuid: now("carl"), queue_type: "RANKED_SOLO_5x5", tier: "BRONZE" },
      { puuid: now("faker"), queue_type: "RANKED_SOLO_5x5", tier: "CHALLENGER" },
      { puuid: now("jaspy"), queue_type: "RANKED_FLEX_SR", tier: "SILVER" },
      { puuid: now("jaspy"), queue_type: "RANKED_SOLO_5x5", tier: "PLATINUM" },
      { puuid: old("p1"), queue_type: "RANKED_SOLO_5x5", tier: "IRON" },
    ]);
    expect(await rowsOf(db, sql`select puuid, recorded_at::text as at, tier, rank from rank_history order by puuid, recorded_at`)).toEqual([
      { puuid: now("carl"), at: "2026-10-05 00:00:00.000001+00", tier: "BRONZE", rank: "I" },
      { puuid: now("jaspy"), at: "2026-10-01 10:00:00.123456+00", tier: "GOLD", rank: "II" },
      { puuid: now("jaspy"), at: "2026-10-10 10:00:00.654321+00", tier: "GOLD", rank: "I" },
      { puuid: now("jaspy"), at: "2026-10-24 12:00:00+00", tier: "PLATINUM", rank: "IV" },
    ]);
    expect(await rowsOf(db, sql`select puuid, match_ids from player_seasons order by puuid`)).toEqual([
      { puuid: now("carl"), match_ids: [g1.matchId, bots.matchId, missing.matchId] },
      { puuid: now("jaspy"), match_ids: [recent1.matchId, g1.matchId] },
    ]);
    expect(await rowsOf(db, sql`select user_id, puuid from user_players order by user_id`)).toEqual([
      { user_id: U1, puuid: now("carl") },
      { user_id: U2, puuid: now("jaspy") },
    ]);
    expect(await rowsOf(db, sql`select match_id, puuid, headline from match_recaps order by match_id, headline`)).toEqual([
      { match_id: g2.matchId, puuid: now("faker"), headline: "Faker recap" },
      { match_id: g1.matchId, puuid: now("carl"), headline: "Carl new recap" },
      { match_id: g1.matchId, puuid: now("jaspy"), headline: "Jaspy recap" },
    ]);
    expect(await rowsOf(db, sql`select puuid, question from ask_questions`)).toEqual([
      { puuid: now("jaspy"), question: "Why do I lose lane?" },
    ]);
    expect(await rowsOf(db, sql`select match_id, puuid, opponent_puuid, version from match_insights order by match_id`)).toEqual([
      { match_id: g2.matchId, puuid: now("faker"), opponent_puuid: now("q1"), version: 2 },
      { match_id: g1.matchId, puuid: now("jaspy"), opponent_puuid: now("carl"), version: 1 },
      { match_id: missing.matchId, puuid: old("m1"), opponent_puuid: now("carl"), version: 1 },
    ]);
    expect(await rowsOf(db, sql`select match_id from benchmark_games`)).toEqual([{ match_id: "NA1_5004" }]);

    const raws = await rowsOf<{ match_id: string; raw: unknown; text: string }>(
      db,
      sql`select match_id, raw, raw::text as text from matches order by match_id`,
    );
    const find = findOldPuuids(file.map);
    for (const { match_id, raw, text } of raws) {
      const spec = [...OLD_GAMES, ...RECENT].find((s) => s.matchId === match_id)!;
      expect(raw, match_id).toEqual(RECENT.includes(spec) ? savedCopy(spec) : expectedRaw(spec));
      expect(find(text), match_id).toEqual([]);
    }

    for (const spec of [...OLD_GAMES, ...RECENT]) {
      const rows = await rowsOf<{ puuid: string }>(db, sql`select puuid from match_participants where match_id = ${spec.matchId}`);
      const inRaw = new Set((RECENT.includes(spec) ? savedCopy(spec) : expectedRaw(spec)).info.participants.map((p) => p.puuid));
      expect(new Set(rows.map((r) => r.puuid)), spec.matchId).toEqual(inRaw);
      expect(rows.length, spec.matchId).toBe(inRaw.size);
    }
    const leftover = await rowsOf<{ n: number }>(db, sql`
      select count(*)::int as n from match_participants
      where puuid in (select jsonb_array_elements_text(${JSON.stringify([...file.map.keys()])}::jsonb))`);
    expect(leftover).toEqual([{ n: 0 }]);
  });

  it("deletes the old scoreboard rows a page saves again just after the commit", async () => {
    const stale = await db
      .insert(schema.matchParticipants)
      .values(participantRows(savedCopy(g1)))
      .onConflictDoNothing()
      .returning({ puuid: schema.matchParticipants.puuid });
    expect(stale).toHaveLength(9);

    expect(await cleanUp(db, file.map)).toEqual({ participantsDeleted: 9, gamesHolding: [] });
    const rows = await rowsOf(db, sql`select count(*)::int as n from match_participants where match_id = ${g1.matchId}`);
    expect(rows).toEqual([{ n: 10 }]);
  });

  it("changes nothing when the same map is applied again", async () => {
    const before = await snapshot(db);
    expect(await apply({ db, dir, log }, file, mapPath)).toEqual({ kind: "already-applied" });
    expect(await snapshot(db)).toEqual(before);
  });

  it("rolls back to exactly the rows from before the apply", async () => {
    const { restored, deleted } = await rollback({ db }, backupFile);
    expect(restored).toMatchObject({ players: 3, matches: 7, match_participants: 51, benchmark_games: 3 });
    expect(deleted).toEqual({
      match_participants: 51,
      match_insights: 1,
      match_recaps: 2,
      rank_history: 3,
      player_seasons: 1,
      ranked_entries: 3,
      players: 1,
    });
    expect(await snapshot(db)).toEqual(beforeApply);

    const lines = readFileSync(backupFile, "utf8").trim().split("\n");
    expect(lines.filter((line) => line.includes('"type":"created"'))).toHaveLength(62);
  });
});
