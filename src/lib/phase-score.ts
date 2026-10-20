import {
  phaseRatings,
  toPhaseGame,
  type PhaseModel,
  type PhaseRating,
} from "@/lib/analyzer/phase-score";
import type { TrimmedTimeline } from "@/lib/analyzer/trim";
import type { Match } from "@/lib/riot/types";
import model from "./analyzer/phase-score-model.json";

// The phase rating models trained by `npm run train-phase-score`. Like the
// game score's, it's a small JSON file that ships with the site.
export const PHASE_MODEL: PhaseModel = model as PhaseModel;

// One player's early, mid and late ratings in a game, for the phases it
// lasted long enough for. Empty when the game can't be rated (ARAM, Arena,
// remakes).
export function ratePhases(
  match: Match,
  timeline: TrimmedTimeline,
  participantId: number,
): PhaseRating[] {
  const game = toPhaseGame(match, timeline);
  return game ? phaseRatings(game, participantId, PHASE_MODEL) : [];
}
