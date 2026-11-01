import Link from "next/link";
import { Suspense } from "react";
import { FilterableMatchList } from "@/components/filterable-match-list";
import { MatchRow } from "@/components/match-row";
import { RiotErrorNotice } from "@/components/riot-error-notice";
import { LoadingBlock, LoadingSection } from "@/components/ui/loading";
import { panelClass } from "@/components/ui/panel";
import { EmptyPanel, linkClass, secondButtonClass } from "@/components/ui/state-panel";
import { findPlayer } from "@/lib/analyzer";
import { championName, getDataDragon } from "@/lib/ddragon";
import { scoreGame } from "@/lib/game-score";
import {
  matchBadges,
  matchTeams,
  roleCounts,
  summarizeMatch,
  summarizeRecord,
  topChampions,
  type MatchSummary,
} from "@/lib/match-summary";
import { loadMatches } from "@/lib/match-store";
import {
  GAMES_STEP,
  isPlainProfilePage,
  listEnd,
  matchListHref,
  MAX_GAMES,
  MISSING_PER_VIEW,
  readGameCount,
} from "@/lib/more-games";
import type { Profile } from "@/lib/profile-store";
import type { QueueFilter } from "@/lib/queue-filters";
import type { Region } from "@/lib/regions";
import { getManyMatchIds } from "@/lib/riot/api";
import { settle } from "@/lib/riot/client";
import type { Match } from "@/lib/riot/types";
import { MatchesControls, matchesHref } from "./queue-tabs";
import { RecentSummary } from "./recent-summary";
import { SeasonChampions } from "./season-champions";
import { MasteryCard } from "./mastery-card";

// `profile` is the player's saved snapshot, whose match IDs are the All tab.
// `queue` is the game-mode tab picked above the list. `gamesParam` is the
// URL's ?games=, how many games to show after "Show 10 more games" (see
// src/lib/more-games.ts); missing means the first 10. playerPath is this
// player's page, e.g. "/player/na/Name-TAG". Each row links to that game's
// match page under that path.
//
// It draws two parts of the Matches grid that page.tsx lays out: the games
// column on the right (`GAMES_COLUMN`) and, under the ranks on the left,
// Season 2026 and Champion mastery (`SIDE_BOTTOM`). On phones they stack in
// that order: ranks, games, then the side panels.
type Props = {
  region: Region;
  puuid: string;
  profile: Profile;
  queue: QueueFilter;
  gamesParam: string | string[] | undefined;
  playerPath: string;
};

// Where each part sits in page.tsx's grid on wide screens. The left column's
// first row holds the ranks; the games span both rows on the right.
export const GAMES_COLUMN = "flex min-w-0 flex-col gap-3.5 lg:col-start-2 lg:row-span-2 lg:row-start-1";
export const SIDE_BOTTOM = "flex flex-col gap-3.5 lg:col-start-1 lg:row-start-2";

export async function RecentMatches({
  region,
  puuid,
  profile,
  queue,
  gamesParam,
  playerPath,
}: Props) {
  // React's lint rule warns that reading the clock makes a component give
  // different output each render. This is a Server Component, which renders
  // once per request, so "now" is exactly what we want.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const count = readGameCount(gamesParam);
  const plainPage = isPlainProfilePage(queue, count);

  const [ids, dd] = await Promise.all([
    // The All tab's first 10 games are the snapshot's, for free. The other
    // tabs, and longer lists after "Show 10 more games", ask Riot for the
    // IDs: one call per 100 games listed.
    plainPage
      ? { ok: true as const, value: profile.matchIds }
      : settle(getManyMatchIds(region, puuid, count, queue.filter)),
    getDataDragon().catch(() => null),
  ]);
  // Stored matches come from the database; only new ones cost a Riot call,
  // and at most MISSING_PER_VIEW of them per view (see src/lib/more-games.ts).
  const result = ids.ok
    ? await loadMatches(region, ids.value, MISSING_PER_VIEW)
    : { matches: [], waiting: 0, error: ids.error };
  // The games left for a refresh. When Riot refused some, `waiting` counts
  // those too and a refresh may not help, so the list says Riot failed
  // instead and keeps its button.
  const waiting = result.error ? 0 : result.waiting;

  // While some games are still to load, the list stops before the first of
  // them. Saved games further down would otherwise show under a gap, and
  // "Last 80 games" would count games that aren't the last 80.
  const loaded = new Set(result.matches.map((m) => m.metadata.matchId));
  const firstMissing = ids.ok ? ids.value.findIndex((id) => !loaded.has(id)) : -1;
  const listed = waiting > 0 && firstMissing >= 0 ? result.matches.slice(0, firstMissing) : result.matches;

  // Keep each full match next to its summary: the row shows the summary, and
  // its score, teams and badges need every player's numbers.
  const games = listed
    .map((match) => ({ match, summary: summarizeMatch(match, puuid) }))
    .filter((g): g is { match: Match; summary: MatchSummary } => g.summary !== null);
  const matches = games.map((g) => g.summary);

  const record = summarizeRecord(matches);

  const oldest = matches.length > 0 ? Math.min(...matches.map((m) => m.startedAt)) : null;
  const end = ids.ok
    ? listEnd({
        idsShown: ids.value.length,
        count,
        oldestStartedAt: oldest,
        now,
        waiting,
        riotFailed: result.error !== null,
      })
    : "end";

  return (
    <>
      <section aria-labelledby="matches-heading" className={GAMES_COLUMN}>
        <MatchesHeading />
        <MatchesControls playerPath={playerPath} queue={queue} view="list" />
        {/* Covers every game in the list, so it grows to "Last 20 games"
            when more are shown. */}
        {record.games > 0 && <RecentSummary record={record} roles={roleCounts(matches)} />}
        {matches.length === 0 ? (
          // Show whatever loaded; an error only matters if nothing did.
          result.error ? (
            <RiotErrorNotice error={result.error} region={region} />
          ) : (
            <EmptyPanel
              title={`No ${queue.id === "all" ? "" : `${queue.label} `}games in the last two months`}
              action={
                queue.id !== "all" && (
                  <Link href={matchesHref(playerPath, "all", "list")} className={secondButtonClass}>
                    Show every mode
                  </Link>
                )
              }
            />
          )
        ) : (
          <FilterableMatchList
            games={games.map(({ match, summary: m }, i) => ({
              // The name players know ("Wukong", not Riot's "MonkeyKing").
              champion: championName(dd, m.championName),
              row: (
                <MatchRow
                  key={m.matchId}
                  id={`game-${i + 1}`}
                  match={m}
                  dd={dd}
                  now={now}
                  score={scoreGame(match).get(findPlayer(match, puuid)?.participantId ?? 0)}
                  teams={{ region, players: matchTeams(match, puuid) }}
                  badges={matchBadges(match, puuid)}
                  href={`${playerPath}/match/${m.matchId}`}
                />
              ),
            }))}
          />
        )}
        {end === "waiting" && matches.length > 0 && (
          <p className="self-center text-note text-quiet">
            {waiting} more {waiting === 1 ? "game hasn't" : "games haven't"} loaded from Riot yet.{" "}
            {/* A plain link, not next/link: a Link to this same URL reuses
                the page it already has instead of asking the server again. */}
            <a
              href={matchListHref(playerPath, queue, count, `game-${games.length + 1}`)}
              className={linkClass}
            >
              Refresh
            </a>{" "}
            to load the next {Math.min(waiting, MISSING_PER_VIEW)}.
          </p>
        )}
        {result.error && matches.length > 0 && (
          <p className="self-center text-note text-quiet">
            Some games couldn&rsquo;t be loaded from Riot just now.
          </p>
        )}
        {end === "two-months" && (
          // HISTORY_DAYS is 60: Riot keeps about two months of games.
          <p className="self-center text-note text-quiet">
            That&rsquo;s every game from the last two months.
          </p>
        )}
        {end === "max" && (
          <p className="self-center text-note text-quiet">The list stops at {MAX_GAMES} games.</p>
        )}
        {end === "more" && (
          <Link
            // Lands on the first new game, where the list left off.
            href={matchListHref(playerPath, queue, count + GAMES_STEP, `game-${games.length + 1}`)}
            className={`${secondButtonClass} sm:self-center`}
          >
            Show 10 more games
          </Link>
        )}
      </section>

      <div className={SIDE_BOTTOM}>
        <Suspense fallback={<SidePanelSkeleton label="Loading season champions" />}>
          <SeasonChampions
            region={region}
            puuid={puuid}
            profileUpdatedAt={profile.updatedAt}
            queue={queue}
            loadMore={plainPage}
            dd={dd}
            recent={topChampions(matches, 4)}
            championsHref={`${playerPath}/champions`}
          />
        </Suspense>
        {/* Loads on its own and hides itself if Riot can't be reached. */}
        <Suspense fallback={null}>
          <MasteryCard region={region} puuid={puuid} dd={dd} />
        </Suspense>
      </div>
    </>
  );
}

// The games column's heading. Only screen readers see it, as the mockup draws
// none; the browser tests find the list by it too.
export function MatchesHeading() {
  return (
    <h2 id="matches-heading" className="sr-only">
      Recent matches
    </h2>
  );
}

// A side panel while it loads: its heading's block, then a few rows.
export function SidePanelSkeleton({ label }: { label: string }) {
  return (
    <div className={`${panelClass} px-[18px] py-4`}>
      <LoadingSection label={label}>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <LoadingBlock className="size-8 shrink-0" />
            <LoadingBlock className="h-3.5 flex-1" />
          </div>
        ))}
      </LoadingSection>
    </div>
  );
}
