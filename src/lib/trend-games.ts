import "server-only";

import { findGameDeaths, type GameDeaths } from "@/lib/analyzer/death-recap";
import { isTrendGame, summarizeGame, type GameTrend } from "@/lib/analyzer/trends";
import { loadMatches, loadTimelines, type SaveTiming } from "@/lib/match-store";
import type { Region } from "@/lib/regions";
import { getMatchIds } from "@/lib/riot/api";
import type { RiotApiError } from "@/lib/riot/client";
import type { Match } from "@/lib/riot/types";

// A player's recent games, summarized for Insights. Used for the player
// whose page it is, and for the player they chose to compare with.
//
// Every game needs its match and its timeline, each one Riot call the first
// time. At most `matchBudget` new matches (10 unless a caller says otherwise)
// and `budget` new timelines are fetched per call, so one view can't use up
// the rate limit. `waiting` is how many are still missing. The Insights page
// reads with both budgets at 0 and lets the batch action do the fetching.
export type TrendGames = {
  matches: Match[]; // every match that loaded
  trendMatches: Match[]; // the ones with a role matchup to compare
  games: GameTrend[]; // the trend matches whose timeline is in
  // Your deaths in each of those games, for "What keeps killing you". Kept
  // apart from GameTrend because benchmark games don't have them.
  deaths: GameDeaths[];
  waiting: number;
  // Why some games are missing, if Riot refused.
  error: RiotApiError | null;
};

const MATCHES_PER_VIEW = 10;

// Throws a RiotApiError if the match list itself can't be fetched. Riot
// returns at most 100 match IDs per request, so `count` can be up to 100.
export async function loadTrendGames(
  region: Region,
  puuid: string,
  {
    count,
    budget,
    queue,
    matchBudget = MATCHES_PER_VIEW,
    persist = "after",
  }: {
    count: number;
    budget: number;
    queue?: number;
    matchBudget?: number;
    persist?: SaveTiming;
  },
): Promise<TrendGames> {
  const ids = await getMatchIds(region, puuid, count, { queue });

  // A match that fails to load is retried on the next batch, like a
  // missing timeline.
  const loaded = await loadMatches(region, ids, matchBudget, persist);
  const { matches } = loaded;
  const trendMatches = matches.filter((m) => isTrendGame(m, puuid));

  const { timelines, error } = await loadTimelines(region, trendMatches, budget, persist);
  const games: GameTrend[] = [];
  const deaths: GameDeaths[] = [];
  for (const m of trendMatches) {
    const timeline = timelines.get(m.metadata.matchId);
    if (!timeline) continue;
    const game = summarizeGame(m, timeline, puuid);
    const died = findGameDeaths(m, timeline, puuid);
    if (game) games.push(game);
    if (died) deaths.push(died);
  }

  return {
    matches,
    trendMatches,
    games,
    deaths,
    waiting: trendMatches.length - games.length + loaded.waiting,
    error: error ?? loaded.error,
  };
}
