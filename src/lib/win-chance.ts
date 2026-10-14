import type { TrimmedTimeline } from "@/lib/analyzer/trim";
import {
  biggestSwings,
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

// One team's win chance through a finished game. Null for games the model
// doesn't cover (ARAM, Arena, remakes).
export function matchWinChance(
  match: Match,
  timeline: TrimmedTimeline,
  teamId: number,
): MatchWinChance | null {
  const game = toWinChanceGame(match, timeline);
  if (!game) return null;
  const chances = teamWinChance(game, WIN_CHANCE_MODEL, teamId);
  if (!chances) return null;
  return { chances, swings: biggestSwings(game, chances, teamId), model: WIN_CHANCE_MODEL };
}
