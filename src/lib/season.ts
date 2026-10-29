// The current ranked season, and the per-champion numbers the profile shows
// for it. Pure, so it's easy to test.

import { kdaRatio } from "@/lib/match-summary";

// Riot's API has no "current season" endpoint, so the start date is written
// here. Update it when a new season starts (early January).
export const SEASON = { id: "2026", label: "Season 2026", start: Date.UTC(2026, 0, 8) };

// Games shorter than this are remakes, which don't count, as elsewhere.
export const REMAKE_SECONDS = 5 * 60;

// Arena has no minions, so its games would pull CS per minute toward zero.
const ARENA_QUEUE = 1700;

// One of the player's games, as stored in match_participants and matches.
export type SeasonGame = {
  matchId: string;
  queueId: number;
  durationS: number;
  championName: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
};

export type SeasonChampion = {
  championName: string;
  games: number;
  wins: number;
  kda: number;
  csPerMin?: number; // missing when every game was in Arena
};

// Each champion's record over these games, most played first. `queueIds`
// limits it to one game mode, as the match list's tabs do; null is every mode.
export function seasonChampions(games: SeasonGame[], queueIds: number[] | null): SeasonChampion[] {
  const counted = games.filter(
    (g) => g.durationS >= REMAKE_SECONDS && (queueIds === null || queueIds.includes(g.queueId)),
  );
  const byChampion = Map.groupBy(counted, (g) => g.championName);
  return [...byChampion]
    .map(([championName, played]) => {
      const sum = (pick: (g: SeasonGame) => number, from = played) =>
        from.reduce((t, g) => t + pick(g), 0);
      const farmed = played.filter((g) => g.queueId !== ARENA_QUEUE);
      const minutes = sum((g) => g.durationS, farmed) / 60;
      return {
        championName,
        games: played.length,
        wins: played.filter((g) => g.win).length,
        // Totals, not an average of each game's KDA, like the profile's record.
        kda: kdaRatio(
          sum((g) => g.kills),
          sum((g) => g.deaths),
          sum((g) => g.assists),
        ),
        csPerMin: minutes > 0 ? sum((g) => g.cs, farmed) / minutes : undefined,
      };
    })
    .sort((a, b) => b.games - a.games || b.wins - a.wins);
}
