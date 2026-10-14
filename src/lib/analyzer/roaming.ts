// Where a jungler or support spent the early game, for Insights' rank
// comparison (see compare.ts):
//   - how often they were on the stronger side of the map, and
//   - how often they were in the enemy's half.
// Jasper (a Grandmaster jungler) suggested both: good junglers play toward
// their winning lanes and spend time in the enemy jungle.
//
// Riot records each player's spot once a minute, so these are shares of
// those snapshots rather than exact time.

import type { Participant } from "@/lib/riot/types";
import { laneRosters, type Roster } from "./jungle-replay";
import { mapArea, onEnemyHalf } from "./map";
import { playerAt } from "./matchup";
import { laneSide } from "./pathing";
import type { TrimmedFrame } from "./trim";

// The first clear usually ends around 3:00, and by 15:00 lanes start to
// break up and group, so "which side is winning" means less after that.
export const ROAM_FROM_MINUTE = 3;
export const ROAM_TO_MINUTE = 15;

// One side counts as stronger only when its lane is at least this much gold
// better off than the other side's. A lane up by 20 gold isn't "winning".
export const STRONGER_SIDE_GAP = 500;

// Of the minutes you were on top side or bot side, the share you spent on
// the side whose lane was clearly doing better. Comparing the two sides at
// the same minute means a stomp (every lane far ahead) or a loss doesn't
// skew it. Minutes in mid lane or base, and minutes when the two sides were
// close, don't count. Null when no minute counted.
export function strongerSideShare(
  frames: TrimmedFrame[],
  participants: Participant[],
  me: Participant,
): number | null {
  const lanes = laneRosters(participants, me.teamId);
  let counted = 0;
  let onStronger = 0;
  for (const frame of earlyFrames(frames)) {
    const position = playerAt(frame, me.participantId).position;
    const side = position ? laneSide(position) : null;
    if (side !== "top" && side !== "bot") continue;
    const top = goldLead(frame, lanes.top);
    const bot = goldLead(frame, lanes.bot);
    if (top === null || bot === null || Math.abs(top - bot) < STRONGER_SIDE_GAP) continue;
    counted++;
    const stronger = top > bot ? "top" : "bot";
    if (side === stronger) onStronger++;
  }
  return counted ? onStronger / counted : null;
}

// The share of minutes you spent past the halfway line, in the enemy's
// jungle or their half of the river. Lanes and bases don't count, since
// standing in a lane isn't invading. Null when Riot left out every position.
export function enemyHalfShare(frames: TrimmedFrame[], me: Participant): number | null {
  let known = 0;
  let inEnemyHalf = 0;
  for (const frame of earlyFrames(frames)) {
    const position = playerAt(frame, me.participantId).position;
    if (!position) continue;
    known++;
    // mapArea's "jungle" is everything outside lanes and bases, river included.
    if (mapArea(position) === "jungle" && onEnemyHalf(position, me.teamId)) inEnemyHalf++;
  }
  return known ? inEnemyHalf / known : null;
}

// The frames from 3:00 to 15:00. Frame i is minute i, except the last one,
// which is the end of the game and isn't on a whole minute.
function earlyFrames(frames: TrimmedFrame[]): TrimmedFrame[] {
  const last = Math.min(ROAM_TO_MINUTE, frames.length - 2);
  return frames.slice(ROAM_FROM_MINUTE, last + 1);
}

// Your laners' gold minus their opponents' (bot lane counts the bot laner and
// the support together). Null when the lane's players can't be matched up.
function goldLead(frame: TrimmedFrame, { ours, theirs }: Roster): number | null {
  if (ours.length === 0 || ours.length !== theirs.length) return null;
  const total = (ids: number[]) => ids.reduce((sum, id) => sum + playerAt(frame, id).gold, 0);
  return total(ours) - total(theirs);
}
