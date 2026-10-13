import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ProfileTabs } from "@/components/profile-tabs";
import { RiotErrorNotice } from "@/components/riot-error-notice";
import { compareWithBenchmarks } from "@/lib/analyzer/compare";
import { computeTrends, isTrendGame, summarizeGame, type GameTrend } from "@/lib/analyzer/trends";
import { loadBenchmarks } from "@/lib/benchmark-store";
import { mapWithLimit } from "@/lib/concurrency";
import { championClass, championName, getDataDragon } from "@/lib/ddragon";
import { loadMatch, loadTimelines } from "@/lib/match-store";
import { isRegion } from "@/lib/regions";
import { getAccount, getMatchIds } from "@/lib/riot/api";
import { settle } from "@/lib/riot/client";
import type { Match } from "@/lib/riot/types";
import { fromSlug, toSlug } from "@/lib/riot-id";
import { AnalysisProgress } from "./analysis-progress";
import { BenchmarkComparison } from "./benchmark-comparison";
import { LaningChart } from "./laning-chart";
import { CsPhases, EarlyDeaths, LeadsAndDeficits } from "./trend-sections";
import { Weaknesses } from "./weaknesses";

// The insights page: trends across a player's last 20 games.
// URL: /player/na/Name-TAG/insights
//
// Every game needs its timeline, which costs one Riot call the first time.
// A new player's 20 timelines would eat a fifth of the dev key's allowance
// (100 calls per 2 minutes) in one go, so each page view fetches at most
// TIMELINES_PER_VIEW new ones. The page shows trends from the games it has so
// far, and <AnalysisProgress> reloads it until every game is in.

type Params = Promise<{ region: string; riotId: string }>;

export const metadata = { title: "Insights" };

const GAME_COUNT = 20;
const TIMELINES_PER_VIEW = 5;
// Trends from one or two games would be noise, so wait for a few.
const MIN_GAMES = 3;

export default function InsightsPage({ params }: { params: Params }) {
  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col gap-7 px-6 pb-20 pt-7">
      <Suspense fallback={<p className="text-muted">Loading insights…</p>}>
        <Insights params={params} />
      </Suspense>
    </main>
  );
}

async function Insights({ params }: { params: Params }) {
  const { region, riotId } = await params;
  const id = fromSlug(riotId);
  if (!isRegion(region) || !id) notFound();

  // Player data is fetched per request, never at build time.
  await connection();

  const account = await settle(getAccount(region, id));
  if (!account.ok) return <RiotErrorNotice error={account.error} />;
  if (!account.value) notFound();
  const { puuid, gameName, tagLine } = account.value;
  const playerPath = `/player/${region}/${toSlug(account.value)}`;

  const header = (
    <>
      <h1 className="font-display text-[52px] font-bold leading-none tracking-[0.01em]">
        {gameName}
        <span className="font-semibold text-placeholder">#{tagLine}</span>
      </h1>
      <ProfileTabs playerPath={playerPath} current="insights" />
    </>
  );

  const ids = await settle(getMatchIds(region, puuid, GAME_COUNT));
  if (!ids.ok) {
    return (
      <>
        {header}
        <RiotErrorNotice error={ids.error} />
      </>
    );
  }

  // Matches cost one Riot call the first time and come from Postgres after
  // that. One that fails to load is retried on the next reload, like a
  // missing timeline.
  const [loaded, dd, benchmarks] = await Promise.all([
    mapWithLimit(ids.value, 5, (matchId) => settle(loadMatch(region, matchId))),
    getDataDragon().catch(() => null),
    loadBenchmarks(),
  ]);
  const matches = loaded.flatMap((m) => (m.ok ? [m.value] : []));
  const trendMatches = matches.filter((m) => isTrendGame(m, puuid));

  const { timelines, error } = await loadTimelines(region, trendMatches, TIMELINES_PER_VIEW);
  const games = trendMatches
    .map((m) => {
      const timeline = timelines.get(m.metadata.matchId);
      return timeline ? summarizeGame(m, timeline, puuid) : null;
    })
    .filter((g): g is GameTrend => g !== null);

  const waiting = trendMatches.length - games.length + (loaded.length - matches.length);
  const firstError = error ?? loaded.find((m) => !m.ok)?.error ?? null;
  const progress = (
    <AnalysisProgress
      analyzed={games.length}
      total={games.length + waiting}
      retryAfterS={firstError?.kind === "rate-limited" ? (firstError.retryAfter ?? null) : null}
    />
  );

  if (games.length < MIN_GAMES) {
    return (
      <>
        {header}
        {waiting > 0 ? progress : <NotEnoughGames skipped={matches.length - trendMatches.length} />}
      </>
    );
  }

  const trends = computeTrends(games);
  const label = (name: string) => championName(dd, name);
  // Null until `npm run benchmarks` has filled the table, or when none of
  // your games has enough Challenger games to compare with.
  const comparison = compareWithBenchmarks(games, benchmarks, (name) => championClass(dd, name));
  return (
    <>
      {header}
      {waiting > 0 && progress}
      <Weaknesses weaknesses={trends.weaknesses} games={games.length} />
      <LaningChart
        games={trends.games}
        laning={trends.laning}
        label={label}
        matchPath={(matchId) => `${playerPath}/match/${matchId}`}
      />
      <LeadsAndDeficits conversion={trends.conversion} />
      <div className="flex flex-wrap items-start gap-5">
        <EarlyDeaths earlyDeaths={trends.earlyDeaths} games={games.length} />
        <CsPhases csPerMin={trends.csPerMin} />
      </div>
      {comparison && <BenchmarkComparison comparison={comparison} dd={dd} />}
      <Footnote games={games.length} matches={matches} trendMatches={trendMatches} />
    </>
  );
}

function NotEnoughGames({ skipped }: { skipped: number }) {
  return (
    <p className="rounded-[14px] border border-line-strong bg-surface px-5 py-4 text-muted">
      Not enough games to spot trends yet. Insights need at least {MIN_GAMES} recent games on
      Summoner&apos;s Rift that lasted 15 minutes or more
      {skipped > 0 &&
        ` (${skipped} of the last ${GAME_COUNT} were ARAM, Arena, remakes or similar)`}
      .
    </p>
  );
}

function Footnote({
  games,
  matches,
  trendMatches,
}: {
  games: number;
  matches: Match[];
  trendMatches: Match[];
}) {
  const skipped = matches.length - trendMatches.length;
  return (
    <p className="text-[13px] text-faint">
      Based on {games} of your last {matches.length} games, each compared with the enemy who played
      your role.
      {skipped > 0 &&
        ` ${skipped} ${skipped === 1 ? "game was" : "games were"} skipped: ARAM, Arena, remakes and games under 15 minutes have no role matchup to compare.`}
    </p>
  );
}
