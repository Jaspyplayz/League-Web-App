// Collects benchmark games: the recent ranked solo games of players sampled
// from every rank, Iron to Challenger, on KR, EUW and NA. Each game is boiled
// down by summarizeGame (the same summary Insights makes of your games) and
// saved to benchmark_games with the player's tier. Every player's end-of-game
// numbers go to score_games, as training data for the game score, and each
// team's numbers at every minute go to win_chance_games, as training data
// for the win chance model.
//
//   npm run benchmarks                                every tier, 3 servers, 10 players per tier
//   npm run benchmarks -- --tiers gold,diamond        just those tiers
//   npm run benchmarks -- --regions na --tiers challenger --players 3   a quick test run
//
// Needs RIOT_API_KEY and DATABASE_URL in .env.local.
//
// It's slow on purpose. It stays under 70 calls every 2 minutes per server, so
// the live site keeps part of the key's 100-call allowance. A first run makes
// about 40 calls per player (1 match list, then 20 matches and 20 timelines),
// so 10 players in each of the 10 tiers take around 2 hours. The three
// servers run side by side, because Riot counts each server's limit
// separately. Later runs skip games already saved, so they're much quicker,
// and stopping a run halfway loses nothing. Games saved before the latest
// stats were added (BENCHMARK_STATS_VERSION in src/db/rows.ts) are fetched
// again and updated, so the run after a new stat costs as much as a first run.

import { parseArgs } from "node:util";
import { loadEnvConfig } from "@next/env";
import { and, count, eq, gte, inArray, lt, notInArray } from "drizzle-orm";
import { getDb, tables, type Db } from "@/db";
import { BENCHMARK_STATS_VERSION, benchmarkRow, winChanceRow } from "@/db/rows";
import { findOneTricks, ONE_TRICK_WINDOW, samplePlayers } from "@/lib/analyzer/benchmarks";
import { plural } from "@/lib/analyzer/format";
import { toScoreGame } from "@/lib/analyzer/score";
import { isTrendGame, summarizeGame } from "@/lib/analyzer/trends";
import { trimTimeline } from "@/lib/analyzer/trim";
import { toWinChanceGame } from "@/lib/analyzer/win-chance";
import { createPacer } from "@/lib/pace";
import { isRegion, type Region } from "@/lib/regions";
import {
  getApexLeague,
  getLeagueEntries,
  getMatch,
  getMatchIds,
  getTimeline,
  RANKED_SOLO_QUEUE,
} from "@/lib/riot/api";
import { RiotApiError } from "@/lib/riot/client";
import { DIVISIONS, isApexTier, isTier, tierName, TIERS, type Tier } from "@/lib/tiers";

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
    tiers: { type: "string", default: TIERS.join(",") },
    players: { type: "string", default: "10" },
  },
});
const regions = args.regions.split(",");
const tiers = args.tiers.toUpperCase().split(",");
const playerCount = Number(args.players);

async function main() {
  const bad = regions.filter((r) => !isRegion(r));
  if (bad.length > 0) throw new Error(`Unknown region: ${bad.join(", ")}`);
  const badTiers = tiers.filter((t) => !isTier(t));
  if (badTiers.length > 0) {
    throw new Error(`Unknown tier: ${badTiers.join(", ")}. Use ${TIERS.join(", ").toLowerCase()}`);
  }
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
  // Lowest tier first, whatever order --tiers gave.
  for (const tier of TIERS.filter((t) => tiers.includes(t))) {
    const players = await pickPlayers(call, region, tier);
    log(`${tierName(tier)}: collecting games from ${plural(players.length, "player")}`);
    for (const [i, puuid] of players.entries()) {
      const { added, saved } = await collectPlayer(db, call, log, region, tier, puuid);
      log(`${tierName(tier)} ${i + 1}/${players.length}: ${added} games saved (${saved} already up to date)`);
    }
  }
}

type Call = ReturnType<typeof pacedCaller>;

// Master, Grandmaster and Challenger are one ladder each. Lower tiers have
// four divisions, so a quarter of the players come from each (page 1 of
// each division, about 200 players, is plenty to sample from).
async function pickPlayers(call: Call, region: Region, tier: Tier): Promise<string[]> {
  if (isApexTier(tier)) {
    const league = await call(() => getApexLeague(region, tier));
    return samplePlayers(league.entries, playerCount);
  }
  const perDivision = Math.ceil(playerCount / DIVISIONS.length);
  const picked: string[] = [];
  for (const division of DIVISIONS) {
    const entries = await call(() => getLeagueEntries(region, tier, division));
    picked.push(...samplePlayers(entries, perDivision));
  }
  return picked.slice(0, playerCount);
}

async function collectPlayer(
  db: Db,
  call: Call,
  log: (message: string) => void,
  region: Region,
  tier: Tier,
  puuid: string,
) {
  const ids = await call(() =>
    getMatchIds(region, puuid, ONE_TRICK_WINDOW, { queue: RANKED_SOLO_QUEUE }),
  );
  const saved = await savedMatchIds(db, puuid, ids);
  const missing = ids.filter((id) => !saved.has(id));

  let added = 0;
  for (const matchId of missing) {
    try {
      const match = await call(() => getMatch(region, matchId));
      // Remakes and games under 15 minutes have nothing to compare.
      if (!isTrendGame(match, puuid)) continue;
      // All ten players' numbers also train the game score (npm run train-score).
      await db
        .insert(tables.scoreGames)
        .values({ matchId, game: toScoreGame(match) })
        .onConflictDoNothing();
      const timeline = trimTimeline(await call(() => getTimeline(region, matchId)));
      // And both teams' minute-by-minute numbers train the win chance
      // model (npm run train-win-chance).
      const chance = toWinChanceGame(match, timeline);
      if (chance) {
        await db.insert(tables.winChanceGames).values(winChanceRow(chance, match)).onConflictDoNothing();
      }
      const game = summarizeGame(match, timeline, puuid);
      if (!game) continue;
      // An older row for the same game gets the new stats.
      const row = benchmarkRow(game, puuid, region, tier);
      const inserted = await db
        .insert(tables.benchmarkGames)
        .values(row)
        .onConflictDoUpdate({
          target: [tables.benchmarkGames.matchId, tables.benchmarkGames.puuid],
          set: row,
        })
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
  const t = tables.benchmarkGames;
  if (ids.length > 0) {
    // Keep only the games in their current last 20, so every player counts
    // the same and the table stays small however often this runs.
    await db.delete(t).where(and(eq(t.puuid, puuid), notInArray(t.matchId, ids)));
    // They may have climbed or dropped since their older games were saved.
    await db.update(t).set({ tier }).where(eq(t.puuid, puuid));
  }
  return { added, saved: saved.size };
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

// The games already saved with every current stat. Older rows don't count,
// so they're fetched again.
async function savedMatchIds(db: Db, puuid: string, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const t = tables.benchmarkGames;
  const rows = await db
    .select({ matchId: t.matchId })
    .from(t)
    .where(
      and(
        eq(t.puuid, puuid),
        inArray(t.matchId, ids),
        gte(t.statsVersion, BENCHMARK_STATS_VERSION),
      ),
    );
  return new Set(rows.map((r) => r.matchId));
}

async function deleteOldGames(db: Db) {
  const cutoff = new Date(Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
  const deleted = await db
    .delete(tables.benchmarkGames)
    .where(lt(tables.benchmarkGames.gameStartAt, cutoff))
    .returning({ matchId: tables.benchmarkGames.matchId });
  if (deleted.length > 0) console.log(`Deleted ${deleted.length} games older than ${MAX_AGE_DAYS} days`);
  // Old patches would teach the win chance model about a game that's
  // changed since, so its training games go too.
  await db.delete(tables.winChanceGames).where(lt(tables.winChanceGames.gameStartAt, cutoff));
}

// What's in the table now, so you can see the run worked.
async function printSummary(db: Db) {
  const t = tables.benchmarkGames;
  const rows = await db
    .select({
      puuid: t.puuid,
      region: t.region,
      tier: t.tier,
      championName: t.championName,
      gameStartAt: t.gameStartAt,
    })
    .from(t);
  const oneTricks = findOneTricks(
    rows.map((r) => ({ ...r, startedAt: r.gameStartAt.getTime() })),
  );

  console.log(`\nbenchmark_games now holds ${rows.length} games.`);
  for (const [group, games] of Map.groupBy(rows, (r) => `${r.region} ${r.tier.toLowerCase()}`)) {
    const players = new Set(games.map((g) => g.puuid));
    const theirOneTricks = [...players].flatMap((p) => oneTricks.get(p) ?? []);
    const champions = theirOneTricks.length > 0 ? ` (${theirOneTricks.join(", ")})` : "";
    console.log(
      `  ${group}: ${plural(games.length, "game")} from ${plural(players.size, "player")}, ` +
        `${plural(theirOneTricks.length, "one-trick")}${champions}`,
    );
  }
  const [chance] = await db.select({ games: count() }).from(tables.winChanceGames);
  console.log(`win_chance_games holds ${plural(chance.games, "game")} for npm run train-win-chance.`);
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
