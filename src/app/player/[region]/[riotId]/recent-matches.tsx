import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { FilterableMatchList } from "@/components/filterable-match-list";
import { MatchDetails } from "@/components/match-details";
import { MatchRow } from "@/components/match-row";
import { RiotErrorNotice } from "@/components/riot-error-notice";
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
import { GAMES_STEP, hasMoreGames, matchListHref, readGameCount } from "@/lib/more-games";
import { PROFILE_MATCH_COUNT, type Profile } from "@/lib/profile-store";
import type { QueueFilter } from "@/lib/queue-filters";
import type { Region } from "@/lib/regions";
import { getMatchIds } from "@/lib/riot/api";
import { settle } from "@/lib/riot/client";
import type { Match } from "@/lib/riot/types";
import { QueueTabs } from "./queue-tabs";
import { RecentSummary } from "./recent-summary";
import { SeasonChampions } from "./season-champions";
import { MasteryCard } from "./mastery-card";

// `profile` is the player's saved snapshot, whose match IDs are the All tab.
// `queue` is the game-mode tab picked above the list. `gamesParam` is the
// URL's ?games=, how many games to show after "Show 10 more games" (see
// src/lib/more-games.ts); missing means the first 10. playerPath is this
// player's page, e.g. "/player/na/Name-TAG". Each row opens a panel with both teams' scoreboard
// and a link to the match analysis under that path.
type Props = {
  region: Region;
  puuid: string;
  profile: Profile;
  queue: QueueFilter;
  gamesParam: string | string[] | undefined;
  playerPath: string;
  ranks?: ReactNode; // the rank cards, shown at the top of the side column
};

export async function RecentMatches({
  region,
  puuid,
  profile,
  queue,
  gamesParam,
  playerPath,
  ranks,
}: Props) {
  // React's lint rule warns that reading the clock makes a component give
  // different output each render. This is a Server Component, which renders
  // once per request, so "now" is exactly what we want.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const count = readGameCount(gamesParam);
  // The plain profile page: the All tab with its first 10 games.
  const plainPage = queue.id === "all" && count === PROFILE_MATCH_COUNT;

  const [ids, dd] = await Promise.all([
    // The All tab's first 10 games are the snapshot's, for free. The other
    // tabs, and longer lists after "Show 10 more games", ask Riot for the
    // IDs: one call per view.
    plainPage
      ? { ok: true as const, value: profile.matchIds }
      : settle(getMatchIds(region, puuid, count, queue.filter)),
    getDataDragon().catch(() => null),
  ]);
  // Stored matches come from the database; only new ones cost a Riot call.
  const result = ids.ok
    ? await loadMatches(region, ids.value, ids.value.length)
    : { matches: [], error: ids.error };

  // Keep each full match next to its summary: the row shows the summary, and
  // the panel under it needs every player's numbers.
  const games = result.matches
    .map((match) => ({ match, summary: summarizeMatch(match, puuid) }))
    .filter((g): g is { match: Match; summary: MatchSummary } => g.summary !== null);
  const matches = games.map((g) => g.summary);

  const record = summarizeRecord(matches);

  const showMore = ids.ok && hasMoreGames(ids.value.length, count);

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <aside className="flex flex-col gap-4 lg:w-80 lg:shrink-0">
        {ranks}
        <Suspense fallback={<p className="text-sm text-faint">Loading season champions…</p>}>
          <SeasonChampions
            region={region}
            puuid={puuid}
            profileUpdatedAt={profile.updatedAt}
            queue={queue}
            loadMore={plainPage}
            dd={dd}
            recent={topChampions(matches, 4)}
          />
        </Suspense>
        {/* Loads on its own and hides itself if Riot can't be reached. */}
        <Suspense fallback={null}>
          <MasteryCard region={region} puuid={puuid} dd={dd} />
        </Suspense>
      </aside>

      <section aria-labelledby="matches-heading" className="flex min-w-0 flex-1 flex-col gap-3">
        <h2 id="matches-heading" className="scroll-mt-4 text-xl font-semibold">
          Recent matches
        </h2>
        <QueueTabs playerPath={playerPath} current={queue} />
        {/* Covers every game in the list, so it grows to "Last 20 games"
            when more are shown. */}
        {record.games > 0 && <RecentSummary record={record} roles={roleCounts(matches)} />}
        {matches.length === 0 ? (
          // Show whatever loaded; an error only matters if nothing did.
          result.error ? (
            <RiotErrorNotice error={result.error} region={region} />
          ) : (
            <p className="text-muted">{emptyMessage(queue)}</p>
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
                  details={
                    <MatchDetails
                      region={region}
                      dd={dd}
                      match={match}
                      puuid={puuid}
                      analysisHref={`${playerPath}/match/${m.matchId}`}
                    />
                  }
                />
              ),
            }))}
          />
        )}
        {showMore && (
          <Link
            // Lands on the first new game, where the list left off.
            href={matchListHref(playerPath, queue, count + GAMES_STEP, `game-${games.length + 1}`)}
            className="self-center rounded-lg border border-line-strong bg-surface px-5 py-2 text-sm font-semibold text-ink transition-colors hover:border-ahead"
          >
            Show 10 more games
          </Link>
        )}
      </section>
    </div>
  );
}

function emptyMessage(queue: QueueFilter): string {
  const mode = queue.id === "all" ? "" : `${queue.label} `;
  return `No recent ${mode}games found.`;
}
