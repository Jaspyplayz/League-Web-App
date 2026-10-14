import { Suspense } from "react";
import { MatchDetails } from "@/components/match-details";
import { MatchRow } from "@/components/match-row";
import { RiotErrorNotice } from "@/components/riot-error-notice";
import { findPlayer } from "@/lib/analyzer";
import { getDataDragon } from "@/lib/ddragon";
import { scoreGame } from "@/lib/game-score";
import {
  matchTeams,
  roleCounts,
  summarizeMatch,
  summarizeRecord,
  topChampions,
  type MatchSummary,
} from "@/lib/match-summary";
import { loadMatches } from "@/lib/match-store";
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
// `queue` is the game-mode tab picked above the list. playerPath is this
// player's page, e.g. "/player/na/Name-TAG". Each row opens a panel with
// both teams' scoreboard and a link to the match analysis under that path.
type Props = {
  region: Region;
  puuid: string;
  profile: Profile;
  queue: QueueFilter;
  playerPath: string;
};

export async function RecentMatches({ region, puuid, profile, queue, playerPath }: Props) {
  const [ids, dd] = await Promise.all([
    // The All tab lists the snapshot's games for free. The other tabs ask
    // Riot for that mode's latest games, one call per view.
    queue.id === "all"
      ? { ok: true as const, value: profile.matchIds }
      : settle(getMatchIds(region, puuid, PROFILE_MATCH_COUNT, queue.filter)),
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
  // React's lint rule warns that reading the clock makes a component give
  // different output each render. This is a Server Component, which renders
  // once per request, so "now" is exactly what we want.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <aside className="flex flex-col gap-4 lg:w-72 lg:shrink-0">
        {record.games > 0 && <RecentSummary record={record} roles={roleCounts(matches)} />}
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
        <h2 id="matches-heading" className="text-xl font-semibold">
          Recent matches
        </h2>
        <QueueTabs playerPath={playerPath} current={queue} />
        {matches.length === 0 ? (
          // Show whatever loaded; an error only matters if nothing did.
          result.error ? (
            <RiotErrorNotice error={result.error} />
          ) : (
            <p className="text-zinc-600 dark:text-zinc-400">
              {queue.id === "all" ? "No recent games found." : `No recent ${queue.label} games.`}
            </p>
          )
        ) : (
          <ul className="flex flex-col gap-2">
            {games.map(({ match, summary: m }) => (
              <MatchRow
                key={m.matchId}
                match={m}
                dd={dd}
                now={now}
                score={scoreGame(match).get(findPlayer(match, puuid)?.participantId ?? 0)}
                teams={{ region, players: matchTeams(match, puuid) }}
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
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
