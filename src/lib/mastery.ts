// Pure helpers for the profile's Champion mastery card.

import type { ChampionMastery } from "@/lib/riot/types";

// The pips under a champion: how many marks the player has earned toward the
// next mastery level, out of how many it takes. Null when that level needs
// no marks, so the card draws no pips at all.
export function masteryMarks(m: ChampionMastery): { earned: number; needed: number } | null {
  const needed = m.markRequiredForNextLevel ?? 0;
  if (needed <= 0) return null;
  return { earned: Math.min(m.tokensEarned ?? 0, needed), needed };
}

// 362587 -> "362,587", the way the League client writes mastery points.
export function formatPoints(points: number): string {
  return points.toLocaleString("en-US");
}
