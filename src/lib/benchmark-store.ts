import "server-only";

import * as Sentry from "@sentry/nextjs";
import { count, eq } from "drizzle-orm";
import { cacheLife } from "next/cache";
import { getDb, tables } from "@/db";
import type { BenchmarkGame } from "@/lib/analyzer/compare";
import type { DeathLabel } from "@/lib/analyzer/deaths";
import { isTier, TIERS, type Tier } from "@/lib/tiers";

// Reads the benchmark games that `npm run benchmarks` collected (see
// docs/database.md, "Benchmark games"). Returns [] when there are none or
// the database can't be reached, and Insights then leaves the comparison out.
export async function loadBenchmarks(tier: Tier): Promise<BenchmarkGame[]> {
  if (!process.env.DATABASE_URL) return [];
  try {
    return await readBenchmarks(tier);
  } catch (error) {
    Sentry.captureException(error);
    return [];
  }
}

// The tiers that have benchmark games, lowest first, with how many each has.
// Insights offers only these in its rank menu.
export async function loadBenchmarkTiers(): Promise<{ tier: Tier; games: number }[]> {
  if (!process.env.DATABASE_URL) return [];
  try {
    return await readTiers();
  } catch (error) {
    Sentry.captureException(error);
    return [];
  }
}

// The table changes only when the script runs, at most a few times a day, so
// one copy per tier is shared by every page view for an hour. It's the whole
// tier (a few thousand small rows) because spotting one-tricks needs each
// player's games in every role. A query that fails throws, so the failure
// isn't cached.
async function readBenchmarks(tier: Tier): Promise<BenchmarkGame[]> {
  "use cache";
  cacheLife("hours");

  const t = tables.benchmarkGames;
  const rows = await getDb().select().from(t).where(eq(t.tier, tier));
  return rows.map((r) => ({
    puuid: r.puuid,
    startedAt: r.gameStartAt.getTime(),
    win: r.win,
    championName: r.championName,
    position: r.position,
    goldAt10: r.goldAt10,
    csAt10: r.csAt10,
    goldAt15: r.goldAt15,
    earlyDeaths: r.earlyDeaths as DeathLabel[],
    csPerMin: { early: r.csPerMinEarly, mid: r.csPerMinMid, late: r.csPerMinLate },
    xpAt15: r.xpAt15,
    earlyTakedowns: r.earlyTakedowns,
    visionPerMin: r.visionPerMin,
    strongerSide: r.strongerSide,
    enemyHalf: r.enemyHalf,
    gankTakedowns: r.gankTakedowns,
    objectiveShare: r.objectiveShare,
    enemyJungleKills: r.enemyJungleKills,
    scuttles: r.scuttles,
  }));
}

async function readTiers(): Promise<{ tier: Tier; games: number }[]> {
  "use cache";
  cacheLife("hours");

  const t = tables.benchmarkGames;
  const rows = await getDb().select({ tier: t.tier, games: count() }).from(t).groupBy(t.tier);
  const games = new Map(rows.flatMap((r) => (isTier(r.tier) ? [[r.tier, r.games] as const] : [])));
  return TIERS.flatMap((tier) => (games.has(tier) ? [{ tier, games: games.get(tier)! }] : []));
}
