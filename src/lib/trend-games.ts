import "server-only";

import { isTrendGame, summarizeGame, type GameTrend } from "@/lib/analyzer/trends";
import { mapWithLimit } from "@/lib/concurrency";
import { loadMatch, loadTimelines } from "@/lib/match-store";
import type { Region } from "@/lib/regions";
import { getMatchIds } from "@/lib/riot/api";
import { settle, type RiotApiError } from "@/lib/riot/client";
import type { Match } from "@/lib/riot/types";

// A player's recent games, summarized for Insights. Used for the player
// whose page it is, and for the player they chose to compare with.
//
// Every game needs its timeline, which costs one Riot call the first time.
// At most `budget` new timelines are fetched per call, so one page view can't
// use up the rate limit; `waiting` says how many games still need one, and
// the page reloads until it's 0.
export type TrendGames = {
  matches: Match[]; // every match that loaded
  trendMatches: Match[]; // the ones with a role matchup to compare
  games: GameTrend[]; // the trend matches whose timeline is in
  waiting: number;
  // Why some games are missing, if Riot refused.
  error: RiotApiError | null;
};

// Throws a RiotApiError if the match list itself can't be fetched.
export async function loadTrendGames(
  region: Region,
  puuid: string,
  { count, budget, queue }: { count: number; budget: number; queue?: number },
): Promise<TrendGames> {
  const ids = await getMatchIds(region, puuid, count, queue);

  // Matches cost one Riot call the first time and come from Postgres after
  // that. One that fails to load is retried on the next reload, like a
  // missing timeline.
  const loaded = await mapWithLimit(ids, 5, (matchId) => settle(loadMatch(region, matchId)));
  const matches = loaded.flatMap((m) => (m.ok ? [m.value] : []));
  const trendMatches = matches.filter((m) => isTrendGame(m, puuid));

  const { timelines, error } = await loadTimelines(region, trendMatches, budget);
  const games = trendMatches
    .map((m) => {
      const timeline = timelines.get(m.metadata.matchId);
      return timeline ? summarizeGame(m, timeline, puuid) : null;
    })
    .filter((g): g is GameTrend => g !== null);

  return {
    matches,
    trendMatches,
    games,
    waiting: trendMatches.length - games.length + (loaded.length - matches.length),
    error: error ?? loaded.find((m) => !m.ok)?.error ?? null,
  };
}
