import type { GameTrend } from "@/lib/analyzer/trends";
import type { Tier } from "@/lib/tiers";

// The filters on Insights: how many recent games to look at, optionally just
// one champion, and which rank to compare with. They live in the URL
// (?games=50&champion=Ahri&tier=diamond), so a filtered page can be shared or
// reloaded.

// Riot returns at most 100 match IDs per request, so 100 is the biggest
// window one request can cover. A bigger one would also take many minutes to
// fill in on the dev key (two Riot calls per new game, 100 calls per 2 minutes).
export const GAME_WINDOWS = [20, 50, 100] as const;
export type GameWindow = (typeof GAME_WINDOWS)[number];

export type InsightsFilters = { games: GameWindow; champion: string | null };

type SearchParams = Record<string, string | string[] | undefined>;

// Anything unexpected in the URL falls back to the defaults.
export function readFilters(searchParams: SearchParams): InsightsFilters {
  const games = Number(searchParams.games);
  const champion = typeof searchParams.champion === "string" ? searchParams.champion : "";
  return {
    games: GAME_WINDOWS.find((w) => w === games) ?? GAME_WINDOWS[0],
    champion: champion || null,
  };
}

// The champions in these games, most played first.
export function championsPlayed(games: GameTrend[]): { championName: string; games: number }[] {
  const counts = Map.groupBy(games, (g) => g.championName);
  return [...counts]
    .map(([championName, played]) => ({ championName, games: played.length }))
    .sort((a, b) => b.games - a.games || a.championName.localeCompare(b.championName));
}

// The rank to compare with: the one asked for in the URL (?tier=diamond) if
// it has benchmark games, otherwise the highest rank that does. Null when
// `npm run benchmarks` hasn't collected anything yet. `available` is lowest
// first, as loadBenchmarkTiers returns it.
export function pickTier(requested: string | string[] | undefined, available: Tier[]): Tier | null {
  const asked = typeof requested === "string" ? requested.toUpperCase() : "";
  const match = available.find((t) => t === asked);
  return match ?? available.at(-1) ?? null;
}
