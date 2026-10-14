import Link from "next/link";
import { Suspense } from "react";
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
import {
  hasOlderGames,
  matchListHref,
  nextBefore,
  oldestAllowed,
  readBefore,
} from "@/lib/older-games";
import { PROFILE_MATCH_COUNT, type Profile } from "@/lib/profile-store";
import type { QueueFilter } from "@/lib/queue-filters";
import type { Region } from "@/lib/regions";
import { getMatchIds } from "@/lib/riot/api";
import { settle } from "@/lib/riot/client";
import type { Match } from "@/lib/riot/types";
import { QueueTabs } from "./queue-tabs";
import { RecentSummary } from "./recent-summary";
import { SeasonChampions } from "./season-champions";

// `profile` is the player's saved snapshot, whose match IDs are the All tab.
// `queue` is the game-mode tab picked above the list. `beforeParam` is the
// URL's ?before=, set on a page of older games (see src/lib/older-games.ts)
// and missing for the latest ones. playerPath is this player's page, e.g.
// "/player/na/Name-TAG". Each row opens a panel with both teams' scoreboard
// and a link to the match analysis under that path.
type Props = {
  region: Region;
  puuid: string;
  profile: Profile;
  queue: QueueFilter;
  beforeParam: string | string[] | undefined;
  playerPath: string;
};

export async function RecentMatches({
  region,
  puuid,
  profile,
  queue,
  beforeParam,
  playerPath,
}: Props) {
  // React's lint rule warns that reading the clock makes a component give
  // different output each render. This is a Server Component, which renders
  // once per request, so "now" is exactly what we want.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const before = readBefore(beforeParam, now);

  const [ids, dd] = await Promise.all([
    // The All tab's latest games are the snapshot's, for free. The other tabs,
    // and every page of older games, ask Riot for that page's IDs: one call
    // per view. Older pages only reach back two months.
    queue.id === "all" && before === null
      ? { ok: true as const, value: profile.matchIds }
      : settle(
          getMatchIds(region, puuid, PROFILE_MATCH_COUNT, {
            ...queue.filter,
            ...(before !== null && {
              startTime: oldestAllowed(now),
              endTime: before,
            }),
          }),
        ),
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

  // Where "Show 10 older games" leads: just before the last game that
  // loaded. If a game failed to load, the next page starts with it instead
  // of skipping it.
  const oldest = games.at(-1)?.match;
  const next = oldest ? nextBefore(oldest) : null;
  const showOlder =
    ids.ok && next !== null && hasOlderGames(ids.value.length, PROFILE_MATCH_COUNT, next, now);

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <aside className="flex flex-col gap-4 lg:w-72 lg:shrink-0">
        {/* "Last 10 games" only makes sense for the latest ones. */}
        {before === null && record.games > 0 && (
          <RecentSummary record={record} roles={roleCounts(matches)} />
        )}
        <Suspense fallback={<p className="text-sm text-zinc-500">Loading season champions…</p>}>
          <SeasonChampions
            region={region}
            puuid={puuid}
            profileUpdatedAt={profile.updatedAt}
            queue={queue}
            dd={dd}
            recent={topChampions(matches, 4)}
          />
        </Suspense>
      </aside>

      <section aria-labelledby="matches-heading" className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="matches-heading" className="scroll-mt-4 text-xl font-semibold">
            {before === null ? "Recent matches" : "Older matches"}
          </h2>
          {before !== null && (
            <Link
              href={matchListHref(playerPath, queue, null)}
              className="text-sm text-muted hover:text-ink hover:underline"
            >
              ← Back to latest games
            </Link>
          )}
        </div>
        <QueueTabs playerPath={playerPath} current={queue} />
        {matches.length === 0 ? (
          // Show whatever loaded; an error only matters if nothing did.
          result.error ? (
            <RiotErrorNotice error={result.error} />
          ) : (
            <p className="text-zinc-600 dark:text-zinc-400">{emptyMessage(queue, before)}</p>
          )
        ) : (
          <FilterableMatchList
            games={games.map(({ match, summary: m }) => ({
              // The name players know ("Wukong", not Riot's "MonkeyKing").
              champion: championName(dd, m.championName),
              row: (
                <MatchRow
                  key={m.matchId}
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
        {showOlder && next !== null && (
          <Link
            href={matchListHref(playerPath, queue, next)}
            className="self-center rounded-lg border border-line-strong bg-surface px-5 py-2 text-sm font-semibold text-ink transition-colors hover:border-ahead"
          >
            Show 10 older games
          </Link>
        )}
      </section>
    </div>
  );
}

function emptyMessage(queue: QueueFilter, before: number | null): string {
  const mode = queue.id === "all" ? "" : `${queue.label} `;
  return before === null
    ? `No recent ${mode}games found.`
    : `No older ${mode}games from the last two months.`;
}
