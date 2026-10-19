// Habits: a few early-game things a player does or doesn't do, read from
// the match and its timeline. Insights shows how often you do each one, how
// often players of a rank do, and how often games with and without it were
// won (see docs/habits.md). Like the rest of the analyzer, it describes what
// happened and never says whether it was right in that game.

import type { Participant } from "@/lib/riot/types";
import { inLane } from "./map";
import { deathSpans, shopVisits } from "./tempo";
import type { ChampionKill, TrimmedTimeline } from "./trim";

export type Habits = {
  // You reached level 6 before your opponent in the same role. Null when
  // neither of you did, or the timeline has no skill points (very old ones).
  level6First: boolean | null;
  // Junglers only: scuttle crabs you took at their first spawn (3:30), minus
  // the enemy jungler's, from Riot's own per-game counts. -2 to 2.
  firstScuttleLead: number | null;
  // Junglers only: seconds into the game of your first kill or assist in a
  // lane. Null when you had none before 14:00 (see `gankTakedowns`).
  firstGankS: number | null;
  // Seconds into the game of your first back, in games where you went back
  // before dying. Null when your first trip to the shop was after a death,
  // since that back wasn't a choice.
  firstBackS: number | null;
};

// Each level gives one skill point, and Riot logs each one to the second, so
// the sixth point is when you hit 6. Points can be spent a little late, but
// almost nobody holds their ultimate point.
const LEVEL_6_POINT = 6;
// Everyone shops at the start. A trip to the shop after this is a back.
const FIRST_BACK_FROM_MS = 2 * 60_000;
// Ganks and backs after this aren't early game any more.
const EARLY_MS = 14 * 60_000;

export function findHabits(
  timeline: TrimmedTimeline,
  me: Participant,
  opponent: Participant,
  jungle: boolean,
): Habits {
  return {
    level6First: level6First(timeline, me.participantId, opponent.participantId),
    firstScuttleLead: jungle ? firstScuttleLead(me, opponent) : null,
    firstGankS: jungle ? firstGankS(timeline, me.participantId) : null,
    firstBackS: firstBackS(timeline, me.participantId),
  };
}

export function level6First(
  { events }: TrimmedTimeline,
  meId: number,
  opponentId: number,
): boolean | null {
  const reached = (id: number) =>
    events.filter((e) => e.type === "SKILL_LEVEL_UP" && e.participantId === id)[
      LEVEL_6_POINT - 1
    ]?.timestamp ?? Infinity;
  const mine = reached(meId);
  const theirs = reached(opponentId);
  if (mine === Infinity && theirs === Infinity) return null;
  return mine < theirs;
}

function firstScuttleLead(me: Participant, opponent: Participant): number | null {
  const mine = me.challenges?.initialCrabCount;
  const theirs = opponent.challenges?.initialCrabCount;
  return mine === undefined || theirs === undefined ? null : mine - theirs;
}

export function firstGankS({ events }: TrimmedTimeline, meId: number): number | null {
  const gank = events.find(
    (e): e is ChampionKill =>
      e.type === "CHAMPION_KILL" &&
      e.timestamp < EARLY_MS &&
      (e.killerId === meId || e.assistingParticipantIds.includes(meId)) &&
      e.position !== null &&
      inLane(e.position),
  );
  return gank ? Math.round(gank.timestamp / 1000) : null;
}

export function firstBackS(timeline: TrimmedTimeline, meId: number): number | null {
  const first = shopVisits(timeline, meId, deathSpans(timeline)).find(
    (v) => v.timestamp >= FIRST_BACK_FROM_MS,
  );
  if (!first || first.afterDeath || first.timestamp >= EARLY_MS) return null;
  return Math.round(first.timestamp / 1000);
}
