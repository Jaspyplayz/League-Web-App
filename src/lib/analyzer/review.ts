// The 60-second review: the three plays you were in that moved your team's
// chance to win the most, so reviewing a game takes a minute instead of
// half an hour. Each comes with a question to think over and opens the
// replay at that second.
//
// It's built on the graded plays (plays.ts), so a moment's size is how much
// it moved the win chance, the same "Win Probability Added" the replay
// shows. That says what a play did to the game, not whether it was the
// right call, which is why each moment asks a question instead of giving a
// verdict.

import { formatClock } from "./format";
import {
  fightSides,
  playStart,
  playSwing,
  playTitle,
  type Grade,
  type Play,
  type ReplayChances,
} from "./plays";
import type { ReplayData } from "./replay";
import { stretchAt, type TempoTimeline } from "./tempo";

export type Moment = {
  // Where the replay jumps to (ms): the first whole second of the play.
  at: number;
  // When it started, as the replay's plays list writes it: "12:31".
  clock: string;
  // "Won a fight 3 for 1, your team took Dragon".
  title: string;
  // Your team's chance to win (0 to 1) just before and just after, and the
  // move in points (7.6 for 52.0% to 59.6%).
  before: number;
  after: number;
  swing: number;
  // Its grade, as the replay's plays list shows it.
  grade: Grade;
  question: string;
  // For junglers, who had tempo just before it. Null for everyone else.
  tempo: string | null;
  // The line it adds to your notes: "12:31 Won a fight 3 for 1: ".
  noteLine: string;
};

// How many moments the review shows.
export const MOMENT_COUNT = 3;

// A play has to move the chance by at least this many points to count, the
// line between Even and Good or Inaccuracy in the grades. Smaller ones are
// farming noise, not a moment that mattered.
const MIN_SWING = 1;

// The plays you were in (a kill, assist or death, or an epic monster you
// helped take) that moved the chance the most either way, in game order.
export function keyPlays(plays: Play[], count = MOMENT_COUNT): Play[] {
  return plays
    .filter((play) => play.mine && Math.abs(playSwing(play)) >= MIN_SWING)
    .sort((a, b) => Math.abs(playSwing(b)) - Math.abs(playSwing(a)))
    .slice(0, count)
    .sort((a, b) => a.from - b.from);
}

// The review's moments, ready for the page. `names` gives each
// participantId's champion.
export function reviewMoments(
  chances: ReplayChances,
  replay: ReplayData,
  meId: number,
  names: Record<number, string>,
  tempo: TempoTimeline | null,
): Moment[] {
  return keyPlays(chances.plays).map((play) => {
    const title = playTitle(play, replay, names);
    const clock = formatClock(play.from);
    return {
      at: playStart(play),
      clock,
      title,
      before: play.before,
      after: play.after,
      swing: playSwing(play),
      grade: play.grade,
      question: momentQuestion(play, replay, meId),
      tempo: tempo ? tempoWords(tempo, play.from - 1, names) : null,
      noteLine: `${clock} ${title}: `,
    };
  });
}

// One question to think over, picked by what happened. They ask what you
// knew or saw, never what you should have done: Riot doesn't allow apps to
// dictate decisions, and the grade can't tell a bad call from bad luck.
export function momentQuestion(play: Play, replay: ReplayData, meId: number): string {
  const kills = play.kills.map((i) => replay.kills[i]);
  const objectives = play.objectives.map((i) => replay.objectives[i]);
  const ours = (teamId: number) => teamId === replay.myTeamId;
  const { won } = fightSides(play.kills, replay);
  const theyTook = objectives.some((o) => !ours(o.teamId));
  const weTook = objectives.some((o) => ours(o.teamId));

  if (playSwing(play) < 0) {
    if (kills.some((k) => k.victimId === meId)) {
      return "What did you know about where the enemy team was just before you died?";
    }
    if (theyTook) return "What was your team doing when the enemy team started on it?";
    return "What did you see just before this fight started?";
  }
  if (weTook && won > 0) return "What set up the fight, and how did it turn into the objective?";
  if (weTook) return "What made it safe to take when you did?";
  return "What set this up, and could you make it happen again?";
}

function tempoWords(tempo: TempoTimeline, t: number, names: Record<number, string>): string | null {
  const tone = stretchAt(tempo.stretches, t)?.tone;
  if (!tone) return null;
  if (tone === "ahead") return "You were up tempo just before it.";
  if (tone === "behind") return `${names[tempo.enemyId] ?? "The enemy jungler"} was up tempo just before it.`;
  return "Tempo was even just before it.";
}
