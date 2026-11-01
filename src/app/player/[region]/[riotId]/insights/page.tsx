import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ChartPlaceholders, InsightsSkeleton } from "@/components/loading-skeleton";
import { ProfileTabs } from "@/components/profile-tabs";
import { RiotErrorNotice } from "@/components/riot-error-notice";
import { compareWithBenchmarks, MIN_PLAYER_GAMES } from "@/lib/analyzer/compare";
import { addUpDeaths, deathsInGames } from "@/lib/analyzer/death-recap";
import { compareHabits } from "@/lib/analyzer/habit-trends";
import { skillToImprove } from "@/lib/analyzer/skill";
import { analyzeSessions, toSessionGames } from "@/lib/analyzer/sessions";
import { checkWeaknesses, computeTrends } from "@/lib/analyzer/trends";
import { loadBenchmarks, loadBenchmarkTiers } from "@/lib/benchmark-store";
import {
  championsPlayed,
  pickTier,
  readFilters,
  readView,
  type InsightsFilters,
} from "@/lib/insights-filters";
import { championClass, championName, getDataDragon, type DataDragon } from "@/lib/ddragon";
import { scoreGame } from "@/lib/game-score";
import { playerKey } from "@/lib/focus";
import { isRegion } from "@/lib/regions";
import { getAccount } from "@/lib/riot/api";
import { settle } from "@/lib/riot/client";
import type { Match } from "@/lib/riot/types";
import { fromSlug, toSlug } from "@/lib/riot-id";
import { tierName } from "@/lib/tiers";
import { fillCounts } from "@/lib/insight-fill";
import { loadTrendGames } from "@/lib/trend-games";
import { advanceInsights } from "./advance";
import { AnalysisProgress } from "./analysis-progress";
import { loadChosenPlayer, readChoice } from "./chosen-player";
import { CompareWithPlayer } from "./compare-with-player";
import { DeathRecapSection } from "./death-recap";
import { MIN_GAMES, NotEnoughGames, TooFewOnChampion } from "./empty-states";
import { FocusPanel } from "./focus";
import { HabitsSection } from "./habits";
import { InsightsFilterBar } from "./insights-filters";
import { InsightsTabs } from "./insights-tabs";
import { SessionBlocks } from "./session-blocks";
import { NoRanks, TierComparison } from "./tier-comparison";
import { LaningChart } from "./laning-chart";
import { CsPhases, EarlyDeaths, LeadsAndDeficits } from "./trend-sections";
import { Weaknesses } from "./weaknesses";

// The insights page: trends across a player's last 20, 50 or 100 games.
// URL: /player/na/Name-TAG/insights, plus ?games=50&champion=Ahri to filter
// and ?tier=diamond to pick the rank to compare with (see
// src/lib/insights-filters.ts), ?vs=Name%23TAG&vsRegion=kr when comparing
// with another player, and ?view=others or ?view=habits for the tab that's
// open (Overview when there's none).
//
// Every game needs its match and timeline, each one Riot call the first
// time. A new player's 100 games would be 200 calls, twice the dev key's
// allowance (100 calls per 2 minutes).

type Params = Promise<{ region: string; riotId: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const metadata = { title: "Insights" };

export default function InsightsPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col gap-3.5 px-4 pb-20 pt-7 sm:px-6">
      <Suspense fallback={<InsightsSkeleton />}>
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
  if (!account.ok) return <RiotErrorNotice error={account.error} region={region} />;
  if (!account.value) notFound();
  const { puuid, gameName, tagLine } = account.value;
  const playerPath = `/player/${region}/${toSlug(account.value)}`;

  const insightsPath = `${playerPath}/insights`;

  // The name and the profile tabs, with more room under them than between
  // the panels below.
  const header = (
    <div className="mb-2.5 flex flex-col gap-6">
      <h1 className="text-title font-semibold">
        {gameName}
        <span className="font-normal text-quiet">#{tagLine}</span>
      </h1>
      <ProfileTabs playerPath={playerPath} current="insights" />
    </div>
  );

  const query = await searchParams;
  const filters = readFilters(query);
  const view = readView(query.view);
  const [loaded, dd, tiers] = await Promise.all([
    // Budgets stay at 0 here. A non-zero budget would fetch on every refresh,
    // and the refresh exists only to redraw charts from what the batch stored.
    settle(loadTrendGames(region, puuid, { count: filters.games, budget: 0, matchBudget: 0 })),
    getDataDragon().catch(() => null),
    loadBenchmarkTiers(),
  ]);
  if (!loaded.ok) {
    return (
      <>
        {header}
        <RiotErrorNotice error={loaded.error} region={region} />
      </>
    );
  }
  const { matches, trendMatches } = loaded.value;
  const allGames = loaded.value.games;

  // The player picked in "Compare with a player", if any. Loaded after your
  // games rather than alongside them, so the two don't hit Riot at once.
  const choice = readChoice(query);
  const chosen = choice ? await loadChosenPlayer(choice, { budget: 0 }) : null;
  const theirs = chosen?.status === "ok" ? chosen : null;

  const counts = fillCounts([
    {
      analyzed: allGames.length,
      waiting: loaded.value.waiting,
      retryAfterS: loaded.value.error?.kind === "rate-limited" ? (loaded.value.error.retryAfter ?? null) : null,
    },
    ...(theirs
      ? [
          {
            analyzed: theirs.games.length,
            waiting: theirs.waiting,
            retryAfterS: theirs.error?.kind === "rate-limited" ? (theirs.error.retryAfter ?? null) : null,
          },
        ]
      : []),
  ]);
  const waiting = counts.total - counts.analyzed;
  const progress = (
    <AnalysisProgress
      analyzed={counts.analyzed}
      total={counts.total}
      retryAfterS={counts.retryAfterS}
      whose={theirs ? `your and ${theirs.name}'s games` : undefined}
      batch={advanceInsights.bind(null, {
        region,
        riotId,
        games: filters.games,
        vs: choice?.input ?? null,
        vsRegion: choice?.region ?? null,
      })}
    />
  );

  // Null until `npm run benchmarks` has collected some games.
  const tier = pickTier(query.tier, tiers.map((t) => t.tier));

  // Every choice on the page, as URL parameters. Each form carries the others
  // along in hidden inputs, so picking one doesn't reset the rest.
  const current: Record<string, string> = {
    games: String(filters.games),
    ...(filters.champion && { champion: filters.champion }),
    ...(typeof query.tier === "string" && tier && { tier: tier.toLowerCase() }),
    ...(choice && { vs: choice.input, vsRegion: choice.region }),
    ...(view !== "overview" && { view }),
  };
  const without = (...names: string[]) =>
    Object.fromEntries(Object.entries(current).filter(([name]) => !names.includes(name)));

  if (allGames.length < MIN_GAMES) {
    return (
      <>
        {header}
        {waiting > 0 ? (
          <>
            {progress}
            <ChartPlaceholders />
          </>
        ) : (
          <NotEnoughGames
            window={filters.games}
            skipped={matches.length - trendMatches.length}
            insightsPath={insightsPath}
            keep={without("games")}
          />
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
  const filterBar = (
    <InsightsFilterBar
      filters={filters}
      champions={champions}
      keep={without("games", "champion")}
    />
  );

  if (games.length < MIN_GAMES) {
    return (
      <>
        {header}
        {filterBar}
        {waiting > 0 && progress}
        <TooFewOnChampion
          name={championName(dd, filters.champion ?? "")}
          games={games.length}
          window={filters.games}
          insightsPath={insightsPath}
          keep={without("games")}
        />
      </>
    );
  }

  const trends = computeTrends(games);
  // Your focus goal is saved in the browser, so the server doesn't know which
  // weakness it is. Each game is checked against all of them, and the panel
  // picks out the one you chose.
  const focusGames = games.map((g) => ({
    matchId: g.matchId,
    startedAt: g.startedAt,
    shows: checkWeaknesses(g),
  }));
  const player = playerKey(region, gameName, tagLine);
  const label = (name: string) => championName(dd, name);
  const classOf = (name: string) => championClass(dd, name);
  // Null when none of your games has enough of that rank's games to compare.
  const benchmarks = tier ? await loadBenchmarks(tier) : [];
  const comparison = compareWithBenchmarks(games, benchmarks, classOf);
  const habits = compareHabits(games, benchmarks);
  const skill = tier
    ? skillToImprove(comparison?.stats ?? null, habits, tierName(tier))
    : null;
  // Session blocks use every game that loaded, ARAM and other champions
  // included: they're about when you played, so leaving games out would
  // break blocks apart. Only matches are needed, no timelines.
  const sessions = analyzeSessions(
    toSessionGames(matches, puuid, (match, id) => scoreGame(match).get(id)?.score ?? null),
  );
  const deathRecap = addUpDeaths(deathsInGames(loaded.value.deaths, games));
  const playerComparison = theirs
    ? compareWithBenchmarks(games, theirs.games, classOf, MIN_PLAYER_GAMES)
    : null;
  return (
    <>
      {header}
      {filterBar}
      <InsightsTabs insightsPath={insightsPath} current={view} keep={without("view")} />
      {waiting > 0 && progress}
      {/* Overview: your own games' trends. */}
      {view === "overview" && (
        <>
          <FocusPanel
            player={player}
            games={focusGames}
            current={trends.weaknesses.map((w) => w.id)}
            playerPath={playerPath}
          />
          <Weaknesses weaknesses={trends.weaknesses} games={games.length} player={player} />
          <LaningChart
            games={trends.games}
            laning={trends.laning}
            label={label}
            matchPath={(matchId) => `${playerPath}/match/${matchId}`}
          />
          {/* One row on wide screens, as in the profile mockup (JAS-87). */}
          <div className="grid items-start gap-3.5 lg:grid-cols-[1.3fr_1fr_0.8fr]">
            <LeadsAndDeficits conversion={trends.conversion} />
            <EarlyDeaths earlyDeaths={trends.earlyDeaths} games={games.length} />
            <CsPhases csPerMin={trends.csPerMin} />
          </div>
          <DeathRecapSection recap={deathRecap} dd={dd} />
        </>
      )}
      {/* You vs others: your games next to a rank's, or one player's. */}
      {view === "others" && (
        <>
          {tier ? (
            <TierComparison
              tier={tier}
              tiers={tiers}
              comparison={comparison}
              skill={skill}
              keep={without("tier")}
              dd={dd}
            />
          ) : (
            <NoRanks />
          )}
          <CompareWithPlayer
            chosen={chosen}
            comparison={playerComparison}
            clearHref={`${insightsPath}?${new URLSearchParams(without("vs", "vsRegion"))}`}
            keep={without("vs", "vsRegion")}
            dd={dd}
          />
        </>
      )}
      {/* Habits and sessions: what you tend to do, and when you play. */}
      {view === "habits" && (
        <>
          <HabitsSection report={habits} tier={tier} />
          <SessionBlocks report={sessions} champion={filters.champion} />
        </>
      )}
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
    <p className="text-note text-quiet">
      Based on {games}
      {which} games out of your last {matches.length}, each compared with the enemy who played your
      role.
      {skipped > 0 &&
        ` ${skipped} ${skipped === 1 ? "game was" : "games were"} skipped: ARAM, Arena, remakes and games under 15 minutes have no role matchup to compare.`}
    </p>
  );
}
