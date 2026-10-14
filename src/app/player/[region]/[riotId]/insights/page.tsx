import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ProfileTabs } from "@/components/profile-tabs";
import { RiotErrorNotice } from "@/components/riot-error-notice";
import { PanelHeading } from "@/components/ui/panel-heading";
import { compareWithBenchmarks, MIN_PLAYER_GAMES } from "@/lib/analyzer/compare";
import { computeTrends } from "@/lib/analyzer/trends";
import { loadBenchmarks } from "@/lib/benchmark-store";
import { championsPlayed, readFilters, type InsightsFilters } from "@/lib/insights-filters";
import { championClass, championName, getDataDragon, type DataDragon } from "@/lib/ddragon";
import { isRegion } from "@/lib/regions";
import { getAccount } from "@/lib/riot/api";
import { settle } from "@/lib/riot/client";
import type { Match } from "@/lib/riot/types";
import { fromSlug, toSlug } from "@/lib/riot-id";
import { loadTrendGames } from "@/lib/trend-games";
import { AnalysisProgress } from "./analysis-progress";
import { BenchmarkComparison } from "./benchmark-comparison";
import { loadChosenPlayer, readChoice } from "./chosen-player";
import { CompareWithPlayer } from "./compare-with-player";
import { InsightsFilterBar } from "./insights-filters";
import { LaningChart } from "./laning-chart";
import { CsPhases, EarlyDeaths, LeadsAndDeficits } from "./trend-sections";
import { Weaknesses } from "./weaknesses";

// The insights page: trends across a player's last 20, 50 or 100 games.
// URL: /player/na/Name-TAG/insights, plus ?games=50&champion=Ahri to filter
// (see src/lib/insights-filters.ts) and ?vs=Name%23TAG&vsRegion=kr when
// comparing with another player.
//
// Every game needs its match and timeline, each one Riot call the first
// time. A new player's 100 games would be 200 calls, twice the dev key's
// allowance (100 calls per 2 minutes), so each page view fetches only a few
// (see src/lib/trend-games.ts). The page shows trends from the games it has
// so far, and <AnalysisProgress> reloads it until every game is in.

type Params = Promise<{ region: string; riotId: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const metadata = { title: "Insights" };

const TIMELINES_PER_VIEW = 5;
// Trends from one or two games would be noise, so wait for a few.
const MIN_GAMES = 3;

export default function InsightsPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col gap-7 px-6 pb-20 pt-7">
      <Suspense fallback={<p className="text-muted">Loading insights…</p>}>
        <Insights params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Insights({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
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

  const query = await searchParams;
  const filters = readFilters(query);
  const [loaded, dd, benchmarks] = await Promise.all([
    settle(loadTrendGames(region, puuid, { count: filters.games, budget: TIMELINES_PER_VIEW })),
    getDataDragon().catch(() => null),
    loadBenchmarks(),
  ]);
  if (!loaded.ok) {
    return (
      <>
        {header}
        <RiotErrorNotice error={loaded.error} />
      </>
    );
  }
  const { matches, trendMatches } = loaded.value;
  const allGames = loaded.value.games;

  // The player picked in "Compare with a player", if any. Loaded after your
  // games rather than alongside them, so the two don't hit Riot at once.
  const choice = readChoice(query);
  const chosen = choice ? await loadChosenPlayer(choice) : null;
  const theirs = chosen?.status === "ok" ? chosen : null;

  // One progress bar for both players' games.
  const waiting = loaded.value.waiting + (theirs?.waiting ?? 0);
  const firstError = loaded.value.error ?? theirs?.error ?? null;
  const progress = (
    <AnalysisProgress
      analyzed={allGames.length + (theirs?.games.length ?? 0)}
      total={allGames.length + (theirs?.games.length ?? 0) + waiting}
      retryAfterS={firstError?.kind === "rate-limited" ? (firstError.retryAfter ?? null) : null}
      whose={theirs ? `your and ${theirs.name}'s games` : undefined}
    />
  );

  if (allGames.length < MIN_GAMES) {
    return (
      <>
        {header}
        {waiting > 0 ? (
          progress
        ) : (
          <NotEnoughGames window={filters.games} skipped={matches.length - trendMatches.length} />
        )}
      </>
    );
  }

  // Everything below uses only the chosen champion's games, if one is picked.
  const games = filters.champion
    ? allGames.filter((g) => g.championName === filters.champion)
    : allGames;
  const champions = championsPlayed(allGames).map((c) => ({
    ...c,
    label: championName(dd, c.championName),
  }));
  // Keep a picked champion in the menu even before any of its games are in.
  if (filters.champion && !champions.some((c) => c.championName === filters.champion)) {
    champions.push({
      championName: filters.champion,
      label: championName(dd, filters.champion),
      games: 0,
    });
  }
  // Each form carries the other's choices along (see InsightsFilterBar).
  const filterParams = {
    games: String(filters.games),
    ...(filters.champion && { champion: filters.champion }),
  };
  const choiceParams: Record<string, string> = choice
    ? { vs: choice.input, vsRegion: choice.region }
    : {};
  const filterBar = (
    <InsightsFilterBar filters={filters} champions={champions} keep={choiceParams} />
  );

  if (games.length < MIN_GAMES) {
    return (
      <>
        {header}
        {waiting > 0 && progress}
        {filterBar}
        <TooFewOnChampion filters={filters} games={games.length} dd={dd} />
      </>
    );
  }

  const trends = computeTrends(games);
  const label = (name: string) => championName(dd, name);
  const classOf = (name: string) => championClass(dd, name);
  // Null until `npm run benchmarks` has filled the table, or when none of
  // your games has enough Challenger games to compare with.
  const comparison = compareWithBenchmarks(games, benchmarks, classOf);
  const playerComparison = theirs
    ? compareWithBenchmarks(games, theirs.games, classOf, MIN_PLAYER_GAMES)
    : null;
  return (
    <>
      {header}
      {waiting > 0 && progress}
      {filterBar}
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
      {comparison && (
        <section aria-labelledby="benchmark-heading" className="flex flex-col gap-3.5">
          <PanelHeading id="benchmark-heading">You vs Challenger</PanelHeading>
          <BenchmarkComparison comparison={comparison} against={{ kind: "challenger" }} dd={dd} />
        </section>
      )}
      <CompareWithPlayer
        chosen={chosen}
        comparison={playerComparison}
        clearHref={`${playerPath}/insights?${new URLSearchParams(filterParams)}`}
        keep={filterParams}
        dd={dd}
      />
      <Footnote
        games={games.length}
        filters={filters}
        matches={matches}
        trendMatches={trendMatches}
        dd={dd}
      />
    </>
  );
}

function NotEnoughGames({ window, skipped }: { window: number; skipped: number }) {
  return (
    <p className="rounded-[14px] border border-line-strong bg-surface px-5 py-4 text-muted">
      Not enough games to spot trends yet. Insights need at least {MIN_GAMES} recent games on
      Summoner&apos;s Rift that lasted 15 minutes or more
      {skipped > 0 && ` (${skipped} of the last ${window} were ARAM, Arena, remakes or similar)`}.
    </p>
  );
}

function TooFewOnChampion({
  filters,
  games,
  dd,
}: {
  filters: InsightsFilters;
  games: number;
  dd: DataDragon | null;
}) {
  const name = championName(dd, filters.champion ?? "");
  return (
    <p className="rounded-[14px] border border-line-strong bg-surface px-5 py-4 text-muted">
      {games === 0
        ? `No ${name} games in your last ${filters.games}.`
        : `Only ${games} ${name} ${games === 1 ? "game" : "games"} in your last ${filters.games}, and trends need at least ${MIN_GAMES}.`}{" "}
      {filters.games < 100 && "Try a bigger window, or pick another champion."}
    </p>
  );
}

function Footnote({
  games,
  filters,
  matches,
  trendMatches,
  dd,
}: {
  games: number;
  filters: InsightsFilters;
  matches: Match[];
  trendMatches: Match[];
  dd: DataDragon | null;
}) {
  const skipped = matches.length - trendMatches.length;
  const which = filters.champion ? ` ${championName(dd, filters.champion)}` : "";
  return (
    <p className="text-[13px] text-faint">
      Based on {games}
      {which} games out of your last {matches.length}, each compared with the enemy who played your
      role.
      {skipped > 0 &&
        ` ${skipped} ${skipped === 1 ? "game was" : "games were"} skipped: ARAM, Arena, remakes and games under 15 minutes have no role matchup to compare.`}
    </p>
  );
}
