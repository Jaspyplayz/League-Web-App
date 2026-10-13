// Collects benchmark games: the recent ranked solo games of the top Challenger
// players on KR, EUW and NA. Each game is boiled down by summarizeGame (the
// same summary Insights makes of your games) and saved to benchmark_games.
//
//   npm run benchmarks                               all three servers, 30 players each
//   npm run benchmarks -- --regions kr --players 5   a quick test run
//
// Needs RIOT_API_KEY and DATABASE_URL in .env.local.
//
// It's slow on purpose. It stays under 70 calls every 2 minutes per server, so
// the live site keeps part of the key's 100-call allowance. A first run makes
// about 40 calls per player (1 match list, then 20 matches and 20 timelines),
// so 30 players take around 35 minutes. The three servers run side by side,
// because Riot counts each server's limit separately. Later runs skip
// games already saved, so they're much quicker, and stopping a run halfway
// loses nothing.

import { parseArgs } from "node:util";
import { loadEnvConfig } from "@next/env";
import { and, eq, inArray, lt, notInArray } from "drizzle-orm";
import { getDb, tables, type Db } from "@/db";
import { benchmarkRow } from "@/db/rows";
import { findOneTricks, ONE_TRICK_WINDOW, topPlayers } from "@/lib/analyzer/benchmarks";
import { isTrendGame, summarizeGame } from "@/lib/analyzer/trends";
import { trimTimeline } from "@/lib/analyzer/trim";
import { createPacer } from "@/lib/pace";
import { isRegion, type Region } from "@/lib/regions";
import {
  getChallengerLeague,
  getMatch,
  getMatchIds,
  getTimeline,
  RANKED_SOLO_QUEUE,
} from "@/lib/riot/api";
import { RiotApiError } from "@/lib/riot/client";

// Read .env.local the same way `next dev` does. The imports above only read
// the environment when they're first used, which is after this line.
loadEnvConfig(process.cwd());

const CALLS_PER_WINDOW = 70;
const WINDOW_MS = 2 * 60 * 1000;
// Games older than this are deleted at the end of each run. That clears out
// players who have dropped out of the top, and keeps the benchmarks on recent
// patches.
const MAX_AGE_DAYS = 60;

const { values: args } = parseArgs({
  options: {
    regions: { type: "string", default: "kr,euw,na" },
    players: { type: "string", default: "30" },
  },
});
const regions = args.regions.split(",");
const playerCount = Number(args.players);

async function main() {
  const bad = regions.filter((r) => !isRegion(r));
  if (bad.length > 0) throw new Error(`Unknown region: ${bad.join(", ")}`);
  if (!Number.isInteger(playerCount) || playerCount < 1) {
    throw new Error("--players must be a whole number above 0");
  }

  const db = getDb();
  try {
    // One server being down shouldn't throw away the others' work.
    const results = await Promise.allSettled(regions.map((r) => collectRegion(db, r as Region)));
    const failures = results.flatMap((result, i) =>
      result.status === "rejected" ? [{ region: regions[i], error: result.reason as unknown }] : [],
    );
    // A bad key fails every server at once, so report it once.
    const badKey = failures.find((f) => f.error instanceof RiotApiError && f.error.kind === "bad-key");
    if (badKey) throw badKey.error;
    for (const { region, error } of failures) {
      console.error(`[${region}] Stopped early:`, error instanceof Error ? error.message : error);
      process.exitCode = 1;
    }
    await deleteOldGames(db);
    await printSummary(db);
  } finally {
    await db.$client.end();
  }
}

async function collectRegion(db: Db, region: Region) {
  const log = (message: string) => console.log(`[${region}] ${message}`);
  const call = pacedCaller(log);

  const league = await call(() => getChallengerLeague(region));
  const players = topPlayers(league, playerCount);
  log(`Collecting games from the top ${players.length} Challenger players`);

  for (const [i, puuid] of players.entries()) {
    const ids = await call(() =>
      getMatchIds(region, puuid, ONE_TRICK_WINDOW, RANKED_SOLO_QUEUE),
    );
    const saved = await savedMatchIds(db, puuid, ids);
    const missing = ids.filter((id) => !saved.has(id));

    let added = 0;
    for (const matchId of missing) {
      try {
        const match = await call(() => getMatch(region, matchId));
        // Remakes and games under 15 minutes have nothing to compare.
        if (!isTrendGame(match, puuid)) continue;
        const timeline = trimTimeline(await call(() => getTimeline(region, matchId)));
        const game = summarizeGame(match, timeline, puuid);
        if (!game) continue;
        const inserted = await db
          .insert(tables.benchmarkGames)
          .values(benchmarkRow(game, puuid, region))
          .onConflictDoNothing()
          .returning({ matchId: tables.benchmarkGames.matchId });
        added += inserted.length;
      } catch (error) {
        // One broken game shouldn't stop the run. A bad key stops everything.
        if (error instanceof RiotApiError && error.kind !== "bad-key") {
          log(`Skipped ${matchId}: ${error.message}`);
          continue;
        }
        throw error;
      }
    }
    // Keep only the games in their current last 20, so every player counts
    // the same and the table stays small however often this runs.
    if (ids.length > 0) {
      const t = tables.benchmarkGames;
      await db.delete(t).where(and(eq(t.puuid, puuid), notInArray(t.matchId, ids)));
    }
    log(`Player ${i + 1}/${players.length}: ${added} new games (${saved.size} already saved)`);
  }
}

// Wraps each Riot call so it waits its turn under the rate limit, and waits
// and tries again if Riot says to slow down anyway (for example because the
// live site used the same key at the same time).
function pacedCaller(log: (message: string) => void) {
  const wait = createPacer(CALLS_PER_WINDOW, WINDOW_MS);
  return async function call<T>(fn: () => Promise<T>): Promise<T> {
    for (;;) {
      await wait();
      try {
        return await fn();
      } catch (error) {
        if (error instanceof RiotApiError && error.kind === "rate-limited") {
          const seconds = error.retryAfter ?? 10;
          log(`Rate limited, waiting ${seconds}s`);
          await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
          continue;
        }
        throw error;
      }
    }
  };
}

async function savedMatchIds(db: Db, puuid: string, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const t = tables.benchmarkGames;
  const rows = await db
    .select({ matchId: t.matchId })
    .from(t)
    .where(and(eq(t.puuid, puuid), inArray(t.matchId, ids)));
  return new Set(rows.map((r) => r.matchId));
}

async function deleteOldGames(db: Db) {
  const cutoff = new Date(Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
  const deleted = await db
    .delete(tables.benchmarkGames)
    .where(lt(tables.benchmarkGames.gameStartAt, cutoff))
    .returning({ matchId: tables.benchmarkGames.matchId });
  if (deleted.length > 0) console.log(`Deleted ${deleted.length} games older than ${MAX_AGE_DAYS} days`);
}

// What's in the table now, so you can see the run worked.
async function printSummary(db: Db) {
  const t = tables.benchmarkGames;
  const rows = await db
    .select({ puuid: t.puuid, region: t.region, championName: t.championName, gameStartAt: t.gameStartAt })
    .from(t);
  const oneTricks = findOneTricks(
    rows.map((r) => ({ ...r, startedAt: r.gameStartAt.getTime() })),
  );

  console.log(`\nbenchmark_games now holds ${rows.length} games.`);
  for (const [region, games] of Map.groupBy(rows, (r) => r.region)) {
    const players = new Set(games.map((g) => g.puuid));
    const theirOneTricks = [...players].flatMap((p) => oneTricks.get(p) ?? []);
    const champions = theirOneTricks.length > 0 ? ` (${theirOneTricks.join(", ")})` : "";
    console.log(
      `  ${region}: ${plural(games.length, "game")} from ${plural(players.size, "player")}, ` +
        `${plural(theirOneTricks.length, "one-trick")}${champions}`,
    );
  }
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

main().catch((error: unknown) => {
  if (error instanceof RiotApiError && error.kind === "bad-key") {
    console.error(
      "Riot rejected RIOT_API_KEY. Development keys expire every 24 hours: make a new one at https://developer.riotgames.com and put it in .env.local.",
    );
  } else if (error instanceof RiotApiError) {
    console.error(`Riot API error: ${error.message}`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
