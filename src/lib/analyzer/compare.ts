// "You vs the top of solo queue": compares your recent games with benchmark
// games from Challenger players (collected by scripts/collect-benchmarks.ts),
// or with the recent games of one player you pick, such as a pro.
//
// Champions play very differently, so each of your games is compared with the
// closest group of benchmark games that's big enough, in this order:
//   1. one-tricks on your champion (the people who know it best),
//   2. any Challenger player on your champion,
//   3. champions of the same class (Fighter, Mage...) in your role,
//   4. everyone in your role.
// Then the per-game comparisons are averaged, so a mixed champion pool still
// gives a fair overall number.

import { findOneTricks } from "./benchmarks";
import type { GameTrend } from "./trends";

// A top player's game, summarized the same way as yours.
export type BenchmarkGame = Omit<GameTrend, "matchId"> & { puuid: string };

export type BenchmarkLevel = "one-trick" | "champion" | "class" | "role";

// A group needs at least this many games before its averages mean much.
export const MIN_BENCHMARK_GAMES = 10;
// One player has only about 20 recent games, spread over a few champions, so
// a group of their games can be smaller. The page shows how many it used.
export const MIN_PLAYER_GAMES = 3;

export type StatKey =
  | "goldAt10"
  | "goldAt15"
  | "csAt10"
  | "csPerMinEarly"
  | "csPerMinMid"
  | "earlyDeaths";

type Stat = {
  key: StatKey;
  pick: (g: Omit<GameTrend, "matchId">) => number | null;
  // Support games are left out of CS stats, as on the rest of Insights.
  farming: boolean;
};

export const STATS: Stat[] = [
  { key: "goldAt10", pick: (g) => g.goldAt10, farming: false },
  { key: "goldAt15", pick: (g) => g.goldAt15, farming: false },
  { key: "csAt10", pick: (g) => g.csAt10, farming: true },
  { key: "csPerMinEarly", pick: (g) => g.csPerMin.early, farming: true },
  { key: "csPerMinMid", pick: (g) => g.csPerMin.mid, farming: true },
  { key: "earlyDeaths", pick: (g) => g.earlyDeaths.length, farming: false },
];

// Your average and the benchmark's, over the games where both exist.
export type StatComparison = { key: StatKey; you: number; them: number; games: number };

// Who one champion (in one role) was compared with.
export type ChampionComparison = {
  championName: string;
  position: string;
  games: number; // your games on it
  // Null when no group had enough games, so these games weren't compared.
  level: BenchmarkLevel | null;
  sample: { games: number; players: number };
  stats: StatComparison[];
};

export type BenchmarkComparison = {
  stats: StatComparison[];
  champions: ChampionComparison[];
  compared: number; // how many of your games had a benchmark
};

type Pool = { level: BenchmarkLevel; games: BenchmarkGame[] };

// `classOf` gives a champion's class, or null if unknown (see championClass in
// src/lib/ddragon.ts). `minGames` is the smallest group worth comparing with.
// Returns null when none of your games could be compared.
export function compareWithBenchmarks(
  games: GameTrend[],
  benchmarks: BenchmarkGame[],
  classOf: (championName: string) => string | null,
  minGames = MIN_BENCHMARK_GAMES,
): BenchmarkComparison | null {
  const oneTricks = findOneTricks(benchmarks);
  const byPosition = Map.groupBy(benchmarks, (b) => b.position);

  // Every game on the same champion in the same role gets the same group.
  const pools = new Map<string, Pool | null>();
  const poolFor = (game: GameTrend): Pool | null => {
    const key = `${game.position}|${game.championName}`;
    if (!pools.has(key)) pools.set(key, findPool(game, byPosition, oneTricks, classOf, minGames));
    return pools.get(key)!;
  };

  const matched = games.flatMap((game) => {
    const pool = poolFor(game);
    return pool ? [{ game, pool }] : [];
  });
  if (matched.length === 0) return null;

  const groups = Map.groupBy(games, (g) => `${g.position}|${g.championName}`);
  const champions: ChampionComparison[] = [...groups.values()]
    .map((theirs) => {
      const pool = poolFor(theirs[0]);
      return {
        championName: theirs[0].championName,
        position: theirs[0].position,
        games: theirs.length,
        level: pool?.level ?? null,
        sample: {
          games: pool?.games.length ?? 0,
          players: new Set(pool?.games.map((g) => g.puuid)).size,
        },
        stats: pool ? compareStats(theirs.map((game) => ({ game, pool }))) : [],
      };
    })
    .sort((a, b) => b.games - a.games);

  return { stats: compareStats(matched), champions, compared: matched.length };
}

function findPool(
  game: GameTrend,
  byPosition: Map<string, BenchmarkGame[]>,
  oneTricks: Map<string, string>,
  classOf: (championName: string) => string | null,
  minGames: number,
): Pool | null {
  const inRole = byPosition.get(game.position) ?? [];
  const champion = game.championName;
  const championClass = classOf(champion);
  const levels: [BenchmarkLevel, (b: BenchmarkGame) => boolean][] = [
    ["one-trick", (b) => b.championName === champion && oneTricks.get(b.puuid) === champion],
    ["champion", (b) => b.championName === champion],
    ["class", (b) => championClass !== null && classOf(b.championName) === championClass],
    ["role", () => true],
  ];
  for (const [level, keep] of levels) {
    const pool = inRole.filter(keep);
    if (pool.length >= minGames) return { level, games: pool };
  }
  return null;
}

// For each stat: your average across the games, and the average of each
// game's benchmark group, over the games where both have a value.
function compareStats(matched: { game: GameTrend; pool: Pool }[]): StatComparison[] {
  return STATS.flatMap(({ key, pick, farming }) => {
    const pairs = matched.flatMap(({ game, pool }) => {
      if (farming && game.position === "UTILITY") return [];
      const you = pick(game);
      const them = average(pool.games.map(pick).filter((v): v is number => v !== null));
      return you === null || them === null ? [] : [{ you, them }];
    });
    if (pairs.length === 0) return [];
    return [
      {
        key,
        you: average(pairs.map((p) => p.you))!,
        them: average(pairs.map((p) => p.them))!,
        games: pairs.length,
      },
    ];
  });
}

function average(nums: number[]): number | null {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}
