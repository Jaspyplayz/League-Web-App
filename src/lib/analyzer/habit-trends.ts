// The Habits section of Insights: for each habit (habits.ts), how often you
// did it and how often those games were won, next to the same numbers for
// players of the rank you picked. See docs/habits.md.
//
// It's a pattern across games, not a verdict on any one of them: hitting 6
// first goes with winning partly because players who are already ahead hit 6
// first. The page says so.

import { MIN_BENCHMARK_GAMES } from "./compare";
import type { Habits } from "./habits";
import type { GameTrend, WinRecord } from "./trends";

// What the section needs from a game, yours or a benchmark player's.
type HabitGame = Pick<GameTrend, "win" | "position" | "habits">;

export type HabitId = "level-6-first" | "first-scuttles" | "early-gank" | "early-back";

// A kill or assist in a lane before this counts as an early gank. Most
// junglers finish their first clear a little after 3:00, so this leaves
// time for one gank after it.
export const EARLY_GANK_S = 6 * 60;

type Rule = {
  id: HabitId;
  jungleOnly: boolean;
  // Whether the game had the habit. Null when it can't tell.
  did: (habits: Habits, backBy: number) => boolean | null;
};

const RULES: Rule[] = [
  { id: "level-6-first", jungleOnly: false, did: (h) => h.level6First },
  {
    id: "first-scuttles",
    jungleOnly: true,
    did: (h) => (h.firstScuttleLead === null ? null : h.firstScuttleLead > 0),
  },
  {
    id: "early-gank",
    jungleOnly: true,
    // For a jungler, no first gank means none before 14:00.
    did: (h) => h.firstGankS !== null && h.firstGankS < EARLY_GANK_S,
  },
  {
    id: "early-back",
    jungleOnly: false,
    did: (h, backBy) => (h.firstBackS === null ? null : h.firstBackS < backBy),
  },
];

// The games with the habit and the games without it, with how many of each
// were won.
export type HabitSplit = { with: WinRecord; without: WinRecord };

export type HabitResult = {
  id: HabitId;
  you: HabitSplit;
  // Null when the rank has fewer than MIN_BENCHMARK_GAMES games on either side.
  rank: HabitSplit | null;
};

export type HabitReport = {
  // The role the section is about: the one you played most.
  position: string;
  games: number; // your games in it
  rankGames: number; // the rank's games in it
  // "First back before 5:10": the rank's usual (median) first back in this
  // role, or yours when there aren't enough of the rank's games. Seconds.
  backBy: number;
  backFrom: "rank" | "you";
  habits: HabitResult[];
};

// You need at least this many games with a habit known before it's shown.
// Even then your own win rates are rough, so the page shows the game counts.
export const MIN_HABIT_GAMES = 3;

// Null when none of your games has habits (every game of yours does, so only
// with no games at all).
export function compareHabits(yours: HabitGame[], rank: HabitGame[]): HabitReport | null {
  const position = mostPlayed(yours.filter((g) => g.habits));
  if (!position) return null;
  const mine = withHabits(yours, position);
  const theirs = withHabits(rank, position);

  const rankBacks = theirs.flatMap((g) => g.habits.firstBackS ?? []);
  const backFrom = rankBacks.length >= MIN_BENCHMARK_GAMES ? "rank" : "you";
  const backBy = median(
    backFrom === "rank" ? rankBacks : mine.flatMap((g) => g.habits.firstBackS ?? []),
  );

  const habits = RULES.filter((r) => !r.jungleOnly || position === "JUNGLE").flatMap((rule) => {
    const you = split(mine, (h) => rule.did(h, backBy));
    if (you.with.games + you.without.games < MIN_HABIT_GAMES) return [];
    const them = split(theirs, (h) => rule.did(h, backBy));
    const enough = Math.min(them.with.games, them.without.games) >= MIN_BENCHMARK_GAMES;
    return [{ id: rule.id, you, rank: enough ? them : null }];
  });

  return { position, games: mine.length, rankGames: theirs.length, backBy, backFrom, habits };
}

type WithHabits = HabitGame & { habits: Habits };

function withHabits(games: HabitGame[], position: string): WithHabits[] {
  return games.filter((g): g is WithHabits => g.habits !== null && g.position === position);
}

function split(games: WithHabits[], did: (h: Habits) => boolean | null): HabitSplit {
  const out: HabitSplit = { with: { games: 0, wins: 0 }, without: { games: 0, wins: 0 } };
  for (const g of games) {
    const answer = did(g.habits);
    if (answer === null) continue;
    const side = answer ? out.with : out.without;
    side.games++;
    if (g.win) side.wins++;
  }
  return out;
}

function mostPlayed(games: HabitGame[]): string | null {
  const counts = new Map<string, number>();
  for (const g of games) counts.set(g.position, (counts.get(g.position) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

// The middle value, rounded to whole seconds. Infinity with no values, so no
// back counts as "before" it; the early-back habit is then left out anyway,
// since no game has a first back to compare.
function median(values: number[]): number {
  if (values.length === 0) return Infinity;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return Math.round(sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2);
}
