// Step numbers are the ones in the plan on issue #154.

import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { sql, type SQL } from "drizzle-orm";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { z } from "zod";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import { REGIONS, type Region } from "@/lib/regions";
import { RiotApiError } from "@/lib/riot/client";
import type { Match } from "@/lib/riot/types";
import {
  anchorProblems,
  buildMap,
  CUTOFF,
  findOldPuuids,
  keyCheckProblems,
  mapFileJson,
  mapsToItself,
  NEW_KEY_GAMES,
  pairGame,
  parseMapFile,
  rewriteRaw,
  spaceProblem,
  type Anchor,
  type GameResult,
  type MapFile,
  type NewPuuid,
  type OldPuuid,
  type PuuidMap,
  type Space,
} from "./remap-puuids-map";

export type FetchMatch = (region: Region, matchId: string) => Promise<Match>;
type Log = (line: string) => void;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// The two players the plan names. Each has an old-key and a new-key players
// row.
const ANCHORS = [
  { gameName: "Jaspy", tagLine: "CA1" },
  { gameName: "Hide on bush", tagLine: "KR1" },
];

const BATCH = 100;

const cutoff = sql`${CUTOFF.toISOString()}::timestamptz`;

export class KeyCheckError extends Error {
  constructor(readonly problems: string[]) {
    super(`The key check failed:\n${problems.map((p) => `- ${p}`).join("\n")}`);
    this.name = "KeyCheckError";
  }
}

export type Counts = {
  matches: number;
  oldMatches: number;
  oldMatchesByHost: Record<string, number>;
  notTenPlayers: number;
  slots: number;
  distinctOldPuuids: number;
  participantRows: number;
  playersOld: number;
  playersNew: number;
  rankedOld: number;
  rankHistoryOld: number;
  seasonsOld: number;
  seasonGamesOld: number;
  userPlayersOld: number;
  recapsOld: number;
  insightsOld: number;
  askOld: number;
  benchmarkOld: number;
} & Space;

type SavedGame = { match_id: string; platform_id: string; raw: unknown };

export async function dryRun({
  db,
  fetchMatch,
  dir,
  log,
}: {
  db: Db;
  fetchMatch: FetchMatch;
  dir: string;
  log: Log;
}): Promise<{ path: string; file: MapFile; counts: Counts }> {
  log("Checking the key on a few games...");
  const anchors = await findAnchors(db);
  const recent = await refetchNewKeyGames(db, fetchMatch);
  const problems = [
    ...recent.problems,
    ...keyCheckProblems({
      newKeyGames: recent.games,
      samples: await refetchSamples(db, fetchMatch, anchors),
      anchors,
    }),
  ];
  if (problems.length > 0) throw new KeyCheckError(problems);

  log("The key is the live site's. Downloading every game saved before the cutoff...");
  const plan = buildMap(await refetchOldGames(db, fetchMatch, log));
  const late = anchorProblems(plan.map, anchors);
  const unchanged = mapsToItself(plan.map);
  if (unchanged.length > 0) late.unshift(`${unchanged.length} PUUIDs came back unchanged.`);
  if (late.length > 0) throw new KeyCheckError(late);

  const counts = await countRows(db);
  const oldPlayers = await db.execute<{ puuid: OldPuuid }>(
    sql`select puuid from players where fetched_at < ${cutoff} order by puuid`,
  );
  const file: MapFile = {
    cutoff: CUTOFF.toISOString(),
    writtenAt: new Date().toISOString(),
    oldPlayers: oldPlayers.map((row) => row.puuid),
    oldMatches: counts.oldMatches,
    ...plan,
  };
  const path = join(dir, `map-${stamp(file.writtenAt)}.json`);
  writeAtomically(path, JSON.stringify({ ...mapFileJson(file), counts }, null, 2));
  return { path, file, counts };
}

async function findAnchors(db: Db): Promise<Anchor[]> {
  return Promise.all(
    ANCHORS.map(async ({ gameName, tagLine }) => {
      const rows = await db.execute<{ puuid: string; old: boolean }>(sql`
        select puuid, fetched_at < ${cutoff} as old from players
        where lower(game_name) = lower(${gameName}) and lower(tag_line) = lower(${tagLine})`);
      return {
        riotId: `${gameName}#${tagLine}`,
        olds: rows.filter((row) => row.old).map((row) => row.puuid as OldPuuid),
        news: rows.filter((row) => !row.old).map((row) => row.puuid as NewPuuid),
      };
    }),
  );
}

async function refetchNewKeyGames(db: Db, fetchMatch: FetchMatch) {
  const saved = await db.execute<SavedGame>(sql`
    select match_id, platform_id, raw from matches
    where fetched_at >= ${cutoff} order by fetched_at desc limit ${NEW_KEY_GAMES}`);
  const problems: string[] = [];
  const games: { matchId: string; saved: unknown; fresh: unknown }[] = [];
  for (const game of saved) {
    const fresh = await download(fetchMatch, game.match_id, game.platform_id);
    if (fresh.ok) games.push({ matchId: game.match_id, saved: game.raw, fresh: fresh.match });
    else problems.push(`${game.match_id} (saved since the cutoff): ${fresh.reason}.`);
  }
  return { games, problems };
}

async function refetchSamples(db: Db, fetchMatch: FetchMatch, anchors: Anchor[]) {
  const samples: GameResult[] = [];
  for (const { olds } of anchors) {
    if (olds.length !== 1) continue;
    const [game] = await db.execute<SavedGame>(sql`
      select m.match_id, m.platform_id, m.raw from matches m
      join match_participants mp on mp.match_id = m.match_id
      where mp.puuid = ${olds[0]} and m.fetched_at < ${cutoff}
      order by m.game_start_at desc limit 1`);
    if (game) samples.push(await refetch(fetchMatch, game));
  }
  return samples;
}

// Riot counts each regional host's limit on its own, so the hosts run side
// by side, each one game at a time.
async function refetchOldGames(db: Db, fetchMatch: FetchMatch, log: Log): Promise<GameResult[]> {
  const games = await db.execute<{ match_id: string; platform_id: string }>(sql`
    select match_id, platform_id from matches where fetched_at < ${cutoff} order by match_id`);
  const byHost = Map.groupBy(games, (game) => hostOf(game.platform_id) ?? "unknown");
  const results = await Promise.all(
    [...byHost].map(async ([host, list]) => {
      const out: GameResult[] = [];
      for (const [i, { match_id }] of list.entries()) {
        const [game] = await db.execute<SavedGame>(
          sql`select match_id, platform_id, raw from matches where match_id = ${match_id}`,
        );
        out.push(await refetch(fetchMatch, game));
        if ((i + 1) % 50 === 0 || i + 1 === list.length) log(`[${host}] ${i + 1}/${list.length} games`);
      }
      return out;
    }),
  );
  return results.flat();
}

async function refetch(fetchMatch: FetchMatch, game: SavedGame): Promise<GameResult> {
  const fresh = await download(fetchMatch, game.match_id, game.platform_id);
  if (!fresh.ok) return { kind: "missing", matchId: game.match_id, reason: fresh.reason };
  return pairGame(game.match_id, game.raw, fresh.match);
}

async function download(
  fetchMatch: FetchMatch,
  matchId: string,
  platformId: string,
): Promise<{ ok: true; match: Match } | { ok: false; reason: string }> {
  const region = regionOf(platformId);
  if (!region) return { ok: false, reason: `no region has the platform ${platformId}` };
  try {
    return { ok: true, match: await fetchMatch(region, matchId) };
  } catch (error) {
    if (error instanceof RiotApiError && error.kind === "not-found") {
      return { ok: false, reason: "Riot has no such game" };
    }
    if (error instanceof RiotApiError && error.kind === "unavailable") {
      return { ok: false, reason: error.message };
    }
    throw error;
  }
}

function regionOf(platformId: string): Region | undefined {
  const platform = platformId.toLowerCase();
  return (Object.keys(REGIONS) as Region[]).find((region) => REGIONS[region].platform === platform);
}

function hostOf(platformId: string): string | undefined {
  const region = regionOf(platformId);
  return region && REGIONS[region].regional;
}

async function countRows(db: Db): Promise<Counts> {
  const [row] = await db.execute<Omit<Counts, "oldMatchesByHost" | keyof Space>>(sql`
    with om as (select match_id, raw from matches where fetched_at < ${cutoff}),
    slots as (
      select s.value as puuid from om, jsonb_array_elements_text(om.raw->'metadata'->'participants') s
    ),
    op as (select distinct puuid from slots),
    oldp as (select puuid from players where fetched_at < ${cutoff})
    select
      (select count(*) from matches)::int as "matches",
      (select count(*) from om)::int as "oldMatches",
      (select count(*) from om where jsonb_array_length(raw->'info'->'participants') <> 10)::int as "notTenPlayers",
      (select count(*) from slots)::int as "slots",
      (select count(*) from op)::int as "distinctOldPuuids",
      (select count(*) from match_participants where match_id in (select match_id from om))::int as "participantRows",
      (select count(*) from oldp)::int as "playersOld",
      (select count(*) from players where fetched_at >= ${cutoff})::int as "playersNew",
      (select count(*) from ranked_entries where puuid in (select puuid from oldp))::int as "rankedOld",
      (select count(*) from rank_history where puuid in (select puuid from oldp))::int as "rankHistoryOld",
      (select count(*) from player_seasons where puuid in (select puuid from oldp))::int as "seasonsOld",
      (select count(*) from season_games where puuid in (select puuid from oldp))::int as "seasonGamesOld",
      (select count(*) from user_players where puuid in (select puuid from oldp))::int as "userPlayersOld",
      (select count(*) from match_recaps where puuid in (select puuid from op))::int as "recapsOld",
      (select count(*) from match_insights
        where puuid in (select puuid from op) or opponent_puuid in (select puuid from op))::int as "insightsOld",
      (select count(*) from ask_questions where puuid in (select puuid from op))::int as "askOld",
      (select count(*) from benchmark_games where collected_at < ${cutoff})::int as "benchmarkOld"`);
  const platforms = await db.execute<{ platform_id: string; games: number }>(sql`
    select platform_id, count(*)::int as games from matches
    where fetched_at < ${cutoff} group by platform_id`);
  const oldMatchesByHost: Record<string, number> = {};
  for (const { platform_id, games } of platforms) {
    const host = hostOf(platform_id) ?? platform_id;
    oldMatchesByHost[host] = (oldMatchesByHost[host] ?? 0) + games;
  }
  return { ...row, ...(await measureSpace(db)), oldMatchesByHost };
}

async function measureSpace(db: Db): Promise<Space> {
  const [space] = await db.execute<Space>(sql`
    select pg_database_size(current_database())::float8 as "databaseBytes",
      (select coalesce(sum(pg_column_size(raw)), 0) from matches where fetched_at < ${cutoff})::float8 as "oldRawBytes"`);
  return space;
}

export function readMapFile(path: string): MapFile {
  const file = parseMapFile(readFileSync(path, "utf8"));
  if (file.cutoff !== CUTOFF.toISOString()) {
    throw new Error(`${path} is for the cutoff ${file.cutoff}, not ${CUTOFF.toISOString()}.`);
  }
  return file;
}

async function withMap<T>(
  db: Db,
  map: PuuidMap,
  work: (tx: Tx) => Promise<T>,
  isolationLevel?: "repeatable read",
): Promise<T> {
  return db.transaction(
    async (tx) => {
      await tx.execute(sql`
        create temp table remap (old_puuid text primary key, new_puuid text not null unique)
        on commit drop`);
      const pairs = [...map].map(([old_puuid, new_puuid]) => ({ old_puuid, new_puuid }));
      await tx.execute(sql`
        insert into remap
        select * from jsonb_to_recordset(${JSON.stringify(pairs)}::jsonb) as x(old_puuid text, new_puuid text)`);
      return work(tx);
    },
    isolationLevel ? { isolationLevel } : undefined,
  );
}

const OLD = sql`(select old_puuid from remap)`;

type Touched = { table: PgTable; name: string; key: string[]; rows: SQL };

function touched(table: PgTable, key: string[], rows: SQL): Touched {
  return { table, name: getTableConfig(table).name, key, rows };
}

export const TOUCHED: Touched[] = [
  touched(schema.players, ["puuid"], sql`puuid in ${OLD}`),
  touched(schema.rankedEntries, ["puuid", "queue_type"], sql`puuid in ${OLD}`),
  touched(schema.playerSeasons, ["puuid", "season"], sql`puuid in ${OLD}`),
  touched(schema.seasonGames, ["puuid", "match_id"], sql`puuid in ${OLD}`),
  touched(schema.rankHistory, ["puuid", "queue_type", "recorded_at"], sql`puuid in ${OLD}`),
  touched(schema.userPlayers, ["user_id"], sql`puuid in ${OLD}`),
  touched(schema.matches, ["match_id"], sql`fetched_at < ${cutoff}`),
  touched(schema.matchRecaps, ["match_id", "puuid"], sql`puuid in ${OLD}`),
  touched(schema.askQuestions, ["id"], sql`puuid in ${OLD}`),
  touched(schema.matchInsights, ["match_id", "puuid"], sql`puuid in ${OLD} or opponent_puuid in ${OLD}`),
  touched(schema.matchParticipants, ["match_id", "puuid"], sql`puuid in ${OLD}`),
  touched(schema.benchmarkGames, ["match_id", "puuid"], sql`collected_at < ${cutoff}`),
];

const TABLE_NAMES = TOUCHED.map((t) => t.name);

function columnList(names: string[], alias?: string): SQL {
  return sql.join(
    names.map((name) => (alias ? sql`${sql.identifier(alias)}.${sql.identifier(name)}` : sql.identifier(name))),
    sql`, `,
  );
}

// Timestamps stay as Postgres text, which keeps their microseconds.
function keyJson(key: string[], alias: string): SQL {
  return sql`jsonb_build_object(${sql.join(
    key.map((name) => sql`${name}::text, ${sql.identifier(alias)}.${sql.identifier(name)}`),
    sql`, `,
  )})`;
}

type Key = Record<string, unknown>;
type BackupSummary = Map<string, { rows: number; digest: string }>;

export type ApplyResult =
  | { kind: "applied"; backupFile: string; backedUp: Record<string, number>; created: Record<string, number> }
  | { kind: "already-applied" };

export async function apply(
  { db, dir, log }: { db: Db; dir: string; log: Log },
  file: MapFile,
  mapPath: string,
): Promise<ApplyResult> {
  if (await alreadyApplied(db, file)) return { kind: "already-applied" };
  const space = spaceProblem(await measureSpace(db));
  if (space) throw new ApplyCheckError([space]);

  const backupFile = join(dir, `backup-${stamp(new Date().toISOString())}.jsonl`);
  const backup = await withMap(db, file.map, (tx) => writeBackup(tx, backupFile, mapPath), "repeatable read");
  const total = [...backup.values()].reduce((sum, t) => sum + t.rows, 0);
  log(`Backed up ${total} rows to ${backupFile}`);

  const created = await withMap(db, file.map, async (tx) => {
    await checkBackupStillHolds(tx, backup);
    const keys = await moveEverything(tx, file, backup);
    const lines = [...keys].flatMap(([table, list]) =>
      list.map((key) => `${JSON.stringify({ type: "created", table, key })}\n`),
    );
    appendFileSync(backupFile, lines.join(""));
    return keys;
  });
  return {
    kind: "applied",
    backupFile,
    backedUp: Object.fromEntries([...backup].map(([table, t]) => [table, t.rows])),
    created: Object.fromEntries([...created].map(([table, keys]) => [table, keys.length])),
  };
}

async function alreadyApplied(db: Db, file: MapFile): Promise<boolean> {
  const moved = file.oldPlayers.filter((puuid) => file.map.has(puuid));
  const [{ present, oldMatches }] = await db.execute<{ present: number; oldMatches: number }>(sql`
    select
      (select count(*) from players
        where puuid in (select jsonb_array_elements_text(${JSON.stringify(moved)}::jsonb)))::int as present,
      (select count(*) from matches where fetched_at < ${cutoff})::int as "oldMatches"`);
  if (oldMatches !== file.oldMatches) {
    throw new Error(
      `${oldMatches} games are saved from before the cutoff, but the dry run found ${file.oldMatches}. Run the dry run again.`,
    );
  }
  if (moved.length > 0 && present === 0) return true;
  if (present !== moved.length) {
    throw new Error(
      `Only ${present} of the map's ${moved.length} old players rows are still there. Run the dry run again.`,
    );
  }
  return false;
}

// Each row as to_jsonb gives it, so timestamps keep their microseconds.
async function writeBackup(tx: Tx, path: string, mapPath: string): Promise<BackupSummary> {
  mkdirSync(dirname(path), { recursive: true });
  const partial = `${path}.partial`;
  const header = { type: "header", version: 1, cutoff: CUTOFF.toISOString(), mapFile: mapPath };
  writeFileSync(partial, `${JSON.stringify(header)}\n`);
  const summary: BackupSummary = new Map();
  for (const t of TOUCHED) {
    const hashes: string[] = [];
    const select = sql`to_jsonb(t) as row, md5(to_jsonb(t)::text) as hash`;
    for await (const rows of pages<{ row: unknown; hash: string }>(tx, t.name, t.key, select, t.rows)) {
      appendFileSync(partial, rows.map((r) => `${JSON.stringify({ type: "row", table: t.name, row: r.row })}\n`).join(""));
      hashes.push(...rows.map((r) => r.hash));
    }
    summary.set(t.name, { rows: hashes.length, digest: digest(hashes) });
  }
  renameSync(partial, path);
  return summary;
}

async function checkBackupStillHolds(tx: Tx, backup: BackupSummary) {
  for (const t of TOUCHED) {
    const rows = await tx.execute<{ hash: string }>(sql`
      select md5(to_jsonb(t)::text) as hash from ${sql.identifier(t.name)} t where ${t.rows} for update`);
    if (digest(rows.map((r) => r.hash)) !== backup.get(t.name)?.digest) {
      throw new Error(`${t.name} changed after the backup was written, so nothing was changed. Run --apply again.`);
    }
  }
}

function digest(hashes: string[]): string {
  return createHash("sha256").update([...hashes].sort().join(",")).digest("hex");
}

export class ApplyCheckError extends Error {
  constructor(readonly problems: string[]) {
    super(`A check failed, so nothing changed:\n${problems.map((p) => `- ${p}`).join("\n")}`);
    this.name = "ApplyCheckError";
  }
}

// Steps 2.1 to 2.8.
async function moveEverything(tx: Tx, file: MapFile, backup: BackupSummary): Promise<Map<string, Key[]>> {
  const created = new Map<string, Key[]>();
  const handled = new Map<string, number>();
  const count = (table: string, rows: number) => handled.set(table, (handled.get(table) ?? 0) + rows);
  const keep = (table: string, rows: { key: Key }[]) => addTo(created, table, rows.map((row) => row.key));

  // 2.1
  keep("players", await tx.execute<{ key: Key }>(sql`
    insert into players
    select copy.* from players p
    join remap r on r.old_puuid = p.puuid
    cross join lateral jsonb_populate_record(p, jsonb_build_object('puuid', r.new_puuid)) copy
    on conflict (puuid) do nothing
    returning ${keyJson(["puuid"], "players")} as key`));

  // 2.2
  for (const [table, other] of [
    ["ranked_entries", "queue_type"],
    ["player_seasons", "season"],
    ["season_games", "match_id"],
  ]) {
    const { moved, deleted } = await moveRows(tx, table, other);
    keep(table, moved);
    count(table, moved.length + deleted);
  }

  // 2.3 Riot keeps no rank history, so every row moves and none is dropped.
  const copied = await tx.execute<{ key: Key }>(sql`
    insert into rank_history
    select copy.* from rank_history h
    join remap r on r.old_puuid = h.puuid
    cross join lateral jsonb_populate_record(h, jsonb_build_object('puuid', r.new_puuid)) copy
    on conflict do nothing
    returning ${keyJson(["puuid", "queue_type", "recorded_at"], "rank_history")} as key`);
  keep("rank_history", copied);
  const historyDeleted = await tx.execute(
    sql`delete from rank_history h using remap r where h.puuid = r.old_puuid returning 1`,
  );
  count("rank_history", historyDeleted.length);

  // 2.4
  count("user_players", (await tx.execute(sql`
    update user_players u set puuid = r.new_puuid from remap r where u.puuid = r.old_puuid returning 1`)).length);
  const recaps = await moveRows(tx, "match_recaps", "match_id");
  keep("match_recaps", recaps.moved);
  count("match_recaps", recaps.moved.length + recaps.deleted);
  count("ask_questions", (await tx.execute(sql`
    update ask_questions q set puuid = r.new_puuid from remap r where q.puuid = r.old_puuid returning 1`)).length);
  const insights = await moveRows(tx, "match_insights", "match_id");
  keep("match_insights", insights.moved);
  const opponents = await tx.execute<{ key: Key }>(sql`
    update match_insights i set opponent_puuid = r.new_puuid from remap r where i.opponent_puuid = r.old_puuid
    returning ${keyJson(["match_id", "puuid"], "i")} as key`);
  const insightRows = new Set([...insights.moved, ...opponents].map((row) => JSON.stringify(row.key)));
  count("match_insights", insightRows.size + insights.deleted);

  count("matches", await rewriteMatches(tx, file));

  // 2.6
  const participants = await tx.execute<{ key: Key }>(sql`
    update match_participants mp set puuid = r.new_puuid from remap r
    where mp.puuid = r.old_puuid
    returning ${keyJson(["match_id", "puuid"], "mp")} as key`);
  keep("match_participants", participants);
  count("match_participants", participants.length);

  // 2.7
  const pointing = await oldPuuidsLeft(tx, PLAYER_CHILDREN);
  if (pointing.length > 0) throw new ApplyCheckError(pointing);
  const playersDeleted = await tx.execute<{ puuid: string }>(
    sql`delete from players p using remap r where p.puuid = r.old_puuid returning p.puuid`,
  );
  count("players", playersDeleted.length);

  // Decision 4 on the issue.
  count("benchmark_games", (await tx.execute(
    sql`delete from benchmark_games where collected_at < ${cutoff} returning 1`,
  )).length);

  // 2.8
  const problems = [
    ...(await oldPuuidsLeft(tx, PUUID_COLUMNS)),
    ...(await verifyApply(tx, file, playersDeleted.map((row) => row.puuid))),
  ];
  if (copied.length !== historyDeleted.length) {
    problems.push(`Copied ${copied.length} rank_history rows but deleted ${historyDeleted.length}.`);
  }
  for (const t of TOUCHED) {
    const expected = backup.get(t.name)?.rows ?? 0;
    const got = handled.get(t.name) ?? 0;
    if (got !== expected) problems.push(`Changed ${got} ${t.name} rows, but ${expected} were backed up.`);
  }
  if (problems.length > 0) throw new ApplyCheckError(problems);
  return created;
}

async function moveRows(tx: Tx, table: string, other: string) {
  const name = sql.identifier(table);
  const otherColumn = sql.identifier(other);
  const deleted = await tx.execute(sql`
    delete from ${name} old_row using remap r
    where old_row.puuid = r.old_puuid
      and exists (
        select 1 from ${name} new_row
        where new_row.puuid = r.new_puuid and new_row.${otherColumn} = old_row.${otherColumn}
      )
    returning 1`);
  const moved = await tx.execute<{ key: Key }>(sql`
    update ${name} old_row set puuid = r.new_puuid from remap r
    where old_row.puuid = r.old_puuid
    returning ${keyJson(["puuid", other], "old_row")} as key`);
  return { moved, deleted: deleted.length };
}

// 2.5
async function rewriteMatches(tx: Tx, file: MapFile): Promise<number> {
  let rewritten = 0;
  const oldGames = sql`fetched_at < ${cutoff}`;
  for await (const games of pages<{ match_id: string; raw: unknown }>(tx, "matches", ["match_id"], sql`match_id, raw`, oldGames)) {
    const updates = games.map((game) => ({
      match_id: game.match_id,
      raw: rewriteRaw(game.raw, file.map, file.summonerIds.get(game.match_id)),
    }));
    const done = await tx.execute(sql`
      update matches m set raw = x.raw
      from jsonb_to_recordset(${JSON.stringify(updates)}::jsonb) as x(match_id text, raw jsonb)
      where m.match_id = x.match_id
      returning 1`);
    rewritten += done.length;
  }
  return rewritten;
}

const PLAYER_CHILDREN = [
  ["ranked_entries", "puuid"],
  ["rank_history", "puuid"],
  ["player_seasons", "puuid"],
  ["season_games", "puuid"],
  ["user_players", "puuid"],
] as const;
const PUUID_COLUMNS = [
  ...PLAYER_CHILDREN,
  ["players", "puuid"],
  ["match_recaps", "puuid"],
  ["ask_questions", "puuid"],
  ["match_insights", "puuid"],
  ["match_insights", "opponent_puuid"],
  ["match_participants", "puuid"],
] as const;

async function oldPuuidsLeft(tx: Tx, columns: readonly (readonly [string, string])[]): Promise<string[]> {
  const problems: string[] = [];
  for (const [table, column] of columns) {
    const [{ n }] = await tx.execute<{ n: number }>(sql`
      select count(*)::int as n from ${sql.identifier(table)} where ${sql.identifier(column)} in ${OLD}`);
    if (n > 0) problems.push(`${n} ${table} rows still have an old ${column}.`);
  }
  return problems;
}

// The rest of 2.8.
async function verifyApply(tx: Tx, file: MapFile, playersDeleted: string[]): Promise<string[]> {
  const problems: string[] = [];
  const [row] = await tx.execute<{ noNewRow: number; disagree: number; oldBenchmarks: number; sharedRiotIds: number }>(sql`
    select
      (select count(*) from remap r
        where r.old_puuid in (select jsonb_array_elements_text(${JSON.stringify(playersDeleted)}::jsonb))
          and not exists (select 1 from players p where p.puuid = r.new_puuid))::int as "noNewRow",
      (select count(*) from match_participants mp join matches m on m.match_id = mp.match_id
        where m.fetched_at < ${cutoff}
          and not exists (
            select 1 from jsonb_array_elements(m.raw->'info'->'participants') p where p->>'puuid' = mp.puuid
          ))::int as "disagree",
      (select count(*) from benchmark_games where collected_at < ${cutoff})::int as "oldBenchmarks",
      (select count(*) from (
        select 1 from players group by region, lower(game_name), lower(tag_line) having count(*) > 1
      ) d)::int as "sharedRiotIds"`);
  if (row.noNewRow > 0) problems.push(`${row.noNewRow} old players have no players row under their new PUUID.`);
  if (row.disagree > 0) problems.push(`${row.disagree} match_participants rows have a PUUID their game's JSON doesn't.`);
  if (row.oldBenchmarks > 0) problems.push(`${row.oldBenchmarks} benchmark_games rows from before the cutoff are left.`);
  if (row.sharedRiotIds > 0) problems.push(`${row.sharedRiotIds} Riot IDs belong to more than one players row.`);
  const holding = await gamesHoldingOldPuuids(tx, file.map);
  if (holding.length > 0) {
    problems.push(`${holding.length} games still have an old PUUID in their JSON, such as ${holding[0]}.`);
  }
  return problems;
}

async function gamesHoldingOldPuuids(tx: Tx, map: PuuidMap): Promise<string[]> {
  const find = findOldPuuids(map);
  const holding: string[] = [];
  const select = sql`match_id, raw::text as text`;
  for await (const games of pages<{ match_id: string; text: string }>(tx, "matches", ["match_id"], select, sql`true`)) {
    for (const game of games) if (find(game.text).length > 0) holding.push(game.match_id);
  }
  return holding;
}

// A table's rows a page at a time, in primary-key order. Each page starts
// after the last key of the one before: with OFFSET, Postgres would read,
// convert and sort every skipped row again for every page.
export async function* pages<R>(tx: Tx, table: string, key: string[], select: SQL, where: SQL) {
  let after = sql`true`;
  for (;;) {
    const rows = await tx.execute<R & { page_key: Key }>(sql`
      select ${select}, ${keyJson(key, "t")} as page_key from ${sql.identifier(table)} t
      where (${where}) and ${after} order by ${columnList(key, "t")} limit ${BATCH}`);
    if (rows.length > 0) yield rows;
    if (rows.length < BATCH) return;
    const last = rows[rows.length - 1].page_key;
    after = sql`(${columnList(key, "t")}) > (${sql.join(key.map((name) => sql`${last[name]}`), sql`, `)})`;
  }
}

// 2.9
export async function cleanUp(db: Db, map: PuuidMap) {
  return withMap(db, map, async (tx) => {
    const deleted = await tx.execute(
      sql`delete from match_participants mp using remap r where mp.puuid = r.old_puuid returning 1`,
    );
    return { participantsDeleted: deleted.length, gamesHolding: await gamesHoldingOldPuuids(tx, map) };
  });
}

const tableName = z.string().refine((name) => TABLE_NAMES.includes(name), "not a table the apply changes");
const backupLine = z.discriminatedUnion("type", [
  z.object({ type: z.literal("header"), version: z.literal(1), cutoff: z.string(), mapFile: z.string() }),
  z.object({ type: z.literal("row"), table: tableName, row: z.record(z.string(), z.unknown()) }),
  z.object({ type: z.literal("created"), table: tableName, key: z.record(z.string(), z.unknown()) }),
]);

function readBackup(path: string) {
  const lines = readFileSync(path, "utf8").split("\n").filter((line) => line.length > 0);
  const [header, ...rest] = lines.map((line) => backupLine.parse(JSON.parse(line)));
  if (header?.type !== "header") throw new Error(`${path} doesn't start with a backup header.`);
  if (header.cutoff !== CUTOFF.toISOString()) throw new Error(`${path} is for the cutoff ${header.cutoff}.`);
  const rows = new Map<string, Key[]>();
  const created = new Map<string, Key[]>();
  for (const line of rest) {
    if (line.type === "row") addTo(rows, line.table, [line.row]);
    if (line.type === "created") addTo(created, line.table, [line.key]);
  }
  return { rows, created };
}

function addTo(index: Map<string, Key[]>, table: string, keys: Key[]) {
  const list = index.get(table) ?? [];
  list.push(...keys);
  index.set(table, list);
}

export async function rollback({ db }: { db: Db }, backupFile: string) {
  const { rows, created } = readBackup(backupFile);
  if (created.size === 0) {
    throw new Error(
      `${backupFile} is from an apply that stopped before it changed anything, so there's nothing to undo. ` +
        `Use the file the finished apply printed after "To undo".`,
    );
  }
  return db.transaction(async (tx) => {
    const [{ n: oldPlayersLeft }] = await tx.execute<{ n: number }>(sql`
      select count(*)::int as n from players
      where puuid in (
        select puuid from jsonb_populate_recordset(null::players, ${JSON.stringify(rows.get("players") ?? [])}::jsonb)
      )`);
    if (oldPlayersLeft > 0) {
      throw new Error(
        `${oldPlayersLeft} old players rows from ${backupFile} are still in the database, so its apply ` +
          "never finished or was already rolled back. Nothing changed.",
      );
    }
    const restored: Record<string, number> = {};
    for (const t of TOUCHED) {
      const columns = getTableConfig(t.table).columns.map((column) => column.name);
      const name = sql.identifier(t.name);
      for (const batch of chunks(rows.get(t.name) ?? [], BATCH)) {
        const json = JSON.stringify(batch);
        await tx.execute(sql`
          insert into ${name} (${columnList(columns)})
          select ${columnList(columns)} from jsonb_populate_recordset(null::${name}, ${json}::jsonb)
          on conflict (${columnList(t.key)}) do update set ${sql.join(
            columns.map((column) => sql`${sql.identifier(column)} = excluded.${sql.identifier(column)}`),
            sql`, `,
          )}`);
        const [{ n }] = await tx.execute<{ n: number }>(sql`
          select count(*)::int as n from jsonb_populate_recordset(null::${name}, ${json}::jsonb) b
          where not exists (
            select 1 from ${name} t
            where (${columnList(t.key, "t")}) = (${columnList(t.key, "b")}) and to_jsonb(t) = to_jsonb(b)
          )`);
        if (n > 0) throw new Error(`${n} ${t.name} rows didn't come back exactly as backed up, so nothing changed.`);
        restored[t.name] = (restored[t.name] ?? 0) + batch.length;
      }
    }

    const deleted: Record<string, number> = {};
    const kept: Record<string, number> = {};
    for (const t of [...TOUCHED].reverse()) {
      const name = sql.identifier(t.name);
      for (const keys of chunks(created.get(t.name) ?? [], BATCH)) {
        const isCreated = sql`(${columnList(t.key, "x")}) in (
          select ${columnList(t.key)} from jsonb_populate_recordset(null::${name}, ${JSON.stringify(keys)}::jsonb)
        )`;
        const gone = await tx.execute(sql`
          delete from ${name} x where ${isCreated} and not (${savedUnder(t)}) returning 1`);
        deleted[t.name] = (deleted[t.name] ?? 0) + gone.length;
        const [{ n }] = await tx.execute<{ n: number }>(sql`select count(*)::int as n from ${name} x where ${isCreated}`);
        if (n > 0) kept[t.name] = (kept[t.name] ?? 0) + n;
      }
    }
    return { restored, deleted, kept };
  });
}

// Whether a row of table t, aliased x, has rows pointing at it. Rollback asks
// once the backup is restored and the apply's copies below x are deleted, so
// any such row is one the site saved since the apply. It isn't in the backup,
// and deleting x would cascade it away.
function savedUnder(t: Touched): SQL {
  const uses = TOUCHED.flatMap((child) =>
    getTableConfig(child.table)
      .foreignKeys.map((fk) => fk.reference())
      .filter((ref) => ref.foreignTable === t.table)
      .map((ref) => {
        const from = ref.columns.map((column) => column.name);
        const to = ref.foreignColumns.map((column) => column.name);
        return sql`exists (select 1 from ${sql.identifier(child.name)} c where (${columnList(from, "c")}) = (${columnList(to, "x")}))`;
      }),
  );
  return uses.length > 0 ? sql.join(uses, sql` or `) : sql`false`;
}

function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

// "2026-10-24T21:05:00.123Z" -> "2026-10-24T21-05-00-123Z", which Windows
// allows in a file name.
function stamp(iso: string): string {
  return iso.replace(/[:.]/g, "-");
}

function writeAtomically(path: string, text: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(`${path}.partial`, text);
  renameSync(`${path}.partial`, path);
}
