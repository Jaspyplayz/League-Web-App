import { gameScores, toScoreGame, type PlayerScore, type ScoreModel } from "@/lib/analyzer/score";
import type { Match } from "@/lib/riot/types";
import model from "./analyzer/score-model.json";

// The game score model trained by `npm run train-score`. It's a small JSON
// file, so it ships with the site and scoring a game costs nothing.
export const SCORE_MODEL: ScoreModel = model as ScoreModel;

// Every player's score in a game, keyed by participantId. Empty when the game
// can't be scored (ARAM, Arena, remakes).
export function scoreGame(match: Match): Map<number, PlayerScore> {
  const scores = gameScores(toScoreGame(match), SCORE_MODEL) ?? [];
  return new Map(scores.map((s) => [s.participantId, s]));
}
