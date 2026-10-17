import { listNames } from "@/lib/analyzer/format";
import type { TrimmedTimeline } from "@/lib/analyzer/trim";
import {
  biggestSwings,
  modelForTier,
  teamWinChance,
  toWinChanceGame,
  type WinChanceModel,
  type WinChanceSwing,
} from "@/lib/analyzer/win-chance";
import type { Match } from "@/lib/riot/types";
import model from "./analyzer/win-chance-model.json";

// The win chance model trained by `npm run train-win-chance`. It's a small
// JSON file, so it ships with the site and drawing the chart costs nothing.
export const WIN_CHANCE_MODEL: WinChanceModel = model as WinChanceModel;

export type MatchWinChance = {
  // The team's chance of winning (0 to 1) at every minute.
  chances: { minute: number; chance: number }[];
  swings: WinChanceSwing[];
  model: WinChanceModel;
};

// One team's win chance through a finished game, from the model for `tier`
// (the player's saved solo queue tier, or null to use all ranks). Null for
// games the model doesn't cover (ARAM, Arena, remakes).
export function matchWinChance(
  match: Match,
  timeline: TrimmedTimeline,
  teamId: number,
  tier: string | null,
): MatchWinChance | null {
  const game = toWinChanceGame(match, timeline);
  if (!game) return null;
  const model = modelForTier(WIN_CHANCE_MODEL, tier);
  const chances = teamWinChance(game, model, teamId);
  if (!chances) return null;
  return { chances, swings: biggestSwings(game, chances, teamId), model };
}

// A swing in words, leading with the side it went toward: "Your team took
// Baron and 2 kills", then what the other side got, if anything. Used by the
// Biggest swings list and the shareable match card.
export function describeSwing(s: WinChanceSwing): { title: string; detail: string | null } {
  const good = s.to > s.from;
  const [first, second] = good
    ? [took("Your team", s.ours), took("The enemy team", s.theirs)]
    : [took("The enemy team", s.theirs), took("Your team", s.ours)];
  return {
    title: first ?? second ?? "Gold and XP shifted",
    detail: first && second ? second : null,
  };
}

// "Your team took Baron and 2 kills", or null when they took nothing.
function took(who: string, things: string[]): string | null {
  return things.length > 0 ? `${who} took ${listNames(things)}` : null;
}
