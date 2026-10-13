// "You vs the opponent in your role": finding that opponent, and the
// per-minute differences between the two of you.

import type { DiffPoint } from "@/lib/diff-chart";
import type { Participant } from "@/lib/riot/types";
import type { PlayerFrame, TrimmedFrame } from "./trim";

export type Metric = "gold" | "cs" | "xp" | "damage";
export const METRICS: Metric[] = ["gold", "cs", "xp", "damage"];

// The position a player played: Riot's assigned position, or its best guess
// from where they spent the game when the assigned one is missing.
export function playedPosition(p: Participant): string {
  if (p.teamPosition) return p.teamPosition;
  return p.individualPosition && p.individualPosition !== "Invalid" ? p.individualPosition : "";
}

// The enemy who played the same position. Null when there isn't exactly one,
// which happens in remakes and some unusual games.
export function findOpponent(participants: Participant[], me: Participant): Participant | null {
  const enemies = participants.filter((p) => p.teamId !== me.teamId);
  for (const field of ["teamPosition", "individualPosition"] as const) {
    const position = me[field];
    if (!position || position === "Invalid") continue;
    const matches = enemies.filter((p) => p[field] === position);
    if (matches.length === 1) return matches[0];
  }
  return null;
}

// Frames list players by participantId, 1 to 10.
export function playerAt(frame: TrimmedFrame, participantId: number): PlayerFrame {
  return frame.players[participantId - 1];
}

// You minus your opponent for one stat, once a minute. Positive means you're
// ahead. The last point is the end of the game, so its minute is usually not
// a whole number (31:42 is minute 31.7).
export function diffSeries(
  frames: TrimmedFrame[],
  meId: number,
  opponentId: number,
  metric: Metric,
): DiffPoint[] {
  return frames.map((frame) => ({
    minute: frame.timestamp / 60_000,
    diff: playerAt(frame, meId)[metric] - playerAt(frame, opponentId)[metric],
  }));
}

export type Snapshot = {
  minute: number;
  you: Record<Metric, number>;
  opponent: Record<Metric, number>;
};

// Both players' stats at a given minute ("@10", "@15"). Null if the game
// ended before then.
export function snapshotAt(
  frames: TrimmedFrame[],
  meId: number,
  opponentId: number,
  minute: number,
): Snapshot | null {
  // Frame 0 is the start of the game and frames are a minute apart, so frame
  // 10 is the 10 minute mark. The very last frame is the end of the game,
  // which isn't on a whole minute, so it doesn't count.
  const frame = frames[minute];
  if (!frame || minute >= frames.length - 1) return null;
  const pick = (p: PlayerFrame) => ({ gold: p.gold, cs: p.cs, xp: p.xp, damage: p.damage });
  return {
    minute,
    you: pick(playerAt(frame, meId)),
    opponent: pick(playerAt(frame, opponentId)),
  };
}

// Your team's total gold minus the enemy team's, once a minute.
export function teamGoldSeries(
  frames: TrimmedFrame[],
  participants: Participant[],
  myTeamId: number,
): DiffPoint[] {
  return frames.map((frame) => {
    let diff = 0;
    for (const p of participants) {
      const gold = playerAt(frame, p.participantId).gold;
      diff += p.teamId === myTeamId ? gold : -gold;
    }
    return { minute: frame.timestamp / 60_000, diff };
  });
}
