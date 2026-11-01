// The sums behind the Summary's board (match/[matchId]/board.tsx): which play
// it opens on, what the eval bar shows and where things sit on the win-chance
// strip. Kept free of React so it can be unit tested, like diff-chart.ts.

import { SWING_THRESHOLD } from "@/lib/analyzer/turning-points";
import type { Grade } from "@/lib/analyzer/plays";

// A play you were in, ready for the board.
export type BoardPlay = {
  minute: number; // when it started
  clock: string; // the same, as "12:31"
  grade: Grade;
  title: string; // "Won a fight 3 for 1"
  after: number; // your team's chance to win just after it, 0 to 1
  swing: number; // how far it moved that chance, in points: 7.6 or -3.2
};

// The strip's line has no need for every second, and a 40-minute game has 2,400.
const STRIP_POINTS = 400;

// The board opens on the play that moved the game most, so the first thing you
// see is where it turned. Ties go to the earlier one. -1 when you were in none.
export function startingPlay(plays: Pick<BoardPlay, "swing">[]): number {
  let best = -1;
  plays.forEach((play, i) => {
    if (best === -1 || Math.abs(play.swing) > Math.abs(plays[best].swing)) best = i;
  });
  return best;
}

// The eval bar, as a percent: your team's chance just after the selected play,
// or at the end of the game when no play is selected.
export function evalChance(
  selected: Pick<BoardPlay, "after"> | null,
  perSecond: number[],
): number {
  if (selected) return selected.after * 100;
  return (perSecond.at(-1) ?? 500) / 10;
}

// The strip's line in chart units: x is the second, y runs from 0 at the top
// (a 100% chance) to 1000 at the bottom, so it stretches to any width.
export function stripLine(perSecond: number[]): string {
  const step = Math.max(1, Math.floor(perSecond.length / STRIP_POINTS));
  let line = "";
  for (let s = 0; s < perSecond.length; s += step) {
    line += `${line ? "L" : "M"}${s},${1000 - perSecond[s]}`;
  }
  // Always end on the game's last second, so the line reaches the right edge.
  const last = perSecond.length - 1;
  if (last > 0 && last % step !== 0) line += `L${last},${1000 - perSecond[last]}`;
  return line;
}

// How far along the game a minute is, as a percent of the strip's width.
export function stripLeft(minute: number, perSecond: number[]): number {
  const lastSecond = Math.max(1, perSecond.length - 1);
  return Math.min(100, Math.max(0, ((minute * 60) / lastSecond) * 100));
}

// Where a play's mark sits on the strip: at its time, at the height of the
// chance it left your team with.
export function markSpot(
  play: Pick<BoardPlay, "minute" | "after">,
  perSecond: number[],
): { left: number; top: number } {
  return { left: stripLeft(play.minute, perSecond), top: (1 - play.after) * 100 };
}

// What the board says under the strip when the game had no big moments:
// JAS-93's wording, one line for each list that would otherwise be there.
export function quietLines({
  hasOpponent,
  turningPoints,
  hasWinChance,
  swings,
}: {
  hasOpponent: boolean;
  turningPoints: number;
  hasWinChance: boolean;
  swings: number;
}): string[] {
  const lines: string[] = [];
  if (hasOpponent && turningPoints === 0) {
    lines.push(
      `No big swings: the gold difference never moved more than ${SWING_THRESHOLD.toLocaleString("en-US")} in a few minutes. This one was decided slowly.`,
    );
  }
  if (hasWinChance && swings === 0) lines.push("No single minute moved the win chance much.");
  return lines;
}
