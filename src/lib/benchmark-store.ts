import "server-only";

import * as Sentry from "@sentry/nextjs";
import { cacheLife } from "next/cache";
import { getDb, tables } from "@/db";
import type { BenchmarkGame } from "@/lib/analyzer/compare";
import type { DeathLabel } from "@/lib/analyzer/deaths";

// Reads the benchmark games that `npm run benchmarks` collected (see
// docs/database.md, "Benchmark games"). Returns [] when there are none or
// the database can't be reached, and Insights then leaves the comparison out.
export async function loadBenchmarks(): Promise<BenchmarkGame[]> {
  if (!process.env.DATABASE_URL) return [];
  try {
    return await readBenchmarks();
  } catch (error) {
    Sentry.captureException(error);
    return [];
  }
}

// The table changes only when the script runs, at most a few times a day, so
// one copy is shared by every page view for an hour. It's all of it (about
// 2,000 small rows) because spotting one-tricks needs each player's games in
// every role. A query that fails throws, so the failure isn't cached.
async function readBenchmarks(): Promise<BenchmarkGame[]> {
  "use cache";
  cacheLife("hours");

  const rows = await getDb().select().from(tables.benchmarkGames);
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
  }));
}
