// Turning points: the biggest swings in gold against your opponent, each
// explained in a sentence or two from what happened during the swing.
// See docs/match-analyzer.md, "Turning points".

import type { Participant } from "@/lib/riot/types";
import type { Death, DeathLabel } from "./deaths";
import { formatClock, formatSigned, listNames, plural, times } from "./format";
import { LANE_TYPES, laneOf } from "./map";
import { playedPosition, playerAt } from "./matchup";
import type { ChampionKill, TrimmedEvent, TrimmedFrame, TurretPlateDestroyed } from "./trim";

// A swing has to move the gold difference at least this much to count. A
// solo kill is worth about 300 gold plus what the victim misses while dead,
// so 750 is roughly "something real happened". Worth tuning on real games.
export const SWING_THRESHOLD = 750;
// The longest stretch one swing can cover, in minutes.
export const MAX_SWING_MINUTES = 4;
export const MAX_TURNING_POINTS = 3;
// A CS change this big within a swing is worth mentioning.
const NOTABLE_CS = 8;

// A stretch of the game, as frame numbers (frame 8 is the 8 minute mark).
export type Swing = { start: number; end: number; swing: number };

// Finds the biggest swings in a list of per-minute differences. Looks at every
// stretch of 1 to 4 minutes, keeps the ones that moved at least `threshold`,
// and picks the biggest few that don't overlap, in game order.
export function findSwings(
  diffs: number[],
  threshold = SWING_THRESHOLD,
  maxSwings = MAX_TURNING_POINTS,
): Swing[] {
  const candidates: Swing[] = [];
  for (let start = 0; start < diffs.length; start++) {
    const last = Math.min(diffs.length - 1, start + MAX_SWING_MINUTES);
    for (let end = start + 1; end <= last; end++) {
      const swing = diffs[end] - diffs[start];
      if (Math.abs(swing) >= threshold) candidates.push(tighten({ start, end, swing }, diffs));
    }
  }

  // Biggest first; for equal swings, prefer the shorter, then the earlier one.
  candidates.sort(
    (a, b) =>
      Math.abs(b.swing) - Math.abs(a.swing) ||
      a.end - a.start - (b.end - b.start) ||
      a.start - b.start,
  );

  const picked: Swing[] = [];
  for (const c of candidates) {
    if (picked.length === maxSwings) break;
    const overlaps = picked.some((p) => c.start < p.end && p.start < c.end);
    if (!overlaps) picked.push(c);
  }
  return picked.sort((a, b) => a.start - b.start);
}

// A 4 minute window often has a quiet minute at either end. Trim those off
// while the window keeps at least 90% of its swing, so the events we explain
// it with are the ones that actually caused it.
function tighten(window: Swing, diffs: number[]): Swing {
  let { start, end } = window;
  const keeps = (s: number, e: number) => {
    const swing = diffs[e] - diffs[s];
    return (
      Math.sign(swing) === Math.sign(window.swing) &&
      Math.abs(swing) >= Math.abs(window.swing) * 0.9
    );
  };
  while (end - start > 1 && keeps(start + 1, end)) start++;
  while (end - start > 1 && keeps(start, end - 1)) end--;
  return { start, end, swing: diffs[end] - diffs[start] };
}

export type TurningPoint = {
  // The moment to point at: the first key event, or the start of the swing.
  timestamp: number;
  startMs: number;
  endMs: number;
  // Gold difference before and after, and the change.
  from: number;
  to: number;
  swing: number;
  title: string;
  detail: string;
};

export type TurningPointContext = {
  frames: TrimmedFrame[];
  events: TrimmedEvent[];
  me: Participant;
  opponent: Participant;
  participants: Participant[];
  deaths: Death[];
  // Display name for a participantId, e.g. "Lee Sin".
  name: (participantId: number) => string;
};

export function findTurningPoints(ctx: TurningPointContext): TurningPoint[] {
  const goldDiffs = ctx.frames.map(
    (f) => playerAt(f, ctx.me.participantId).gold - playerAt(f, ctx.opponent.participantId).gold,
  );
  return findSwings(goldDiffs).map((s) => explainSwing(s, goldDiffs, ctx));
}

function explainSwing(s: Swing, goldDiffs: number[], ctx: TurningPointContext): TurningPoint {
  const startMs = ctx.frames[s.start].timestamp;
  const endMs = ctx.frames[s.end].timestamp;
  const inWindow = (t: number) => t > startMs && t <= endMs;
  const facts = gatherFacts(ctx, s, inWindow);
  const opp = ctx.name(ctx.opponent.participantId);
  const behind = s.swing < 0;

  const { title, at } = behind ? losingTitle(facts, ctx, opp) : winningTitle(facts, opp);
  const causes = (behind ? losingCauses(facts, ctx, opp) : winningCauses(facts, opp)).slice(0, 2);
  const movement = `You went from ${formatSigned(goldDiffs[s.start])} to ${formatSigned(goldDiffs[s.end])} gold against ${opp} between ${formatClock(startMs)} and ${formatClock(endMs)}.`;

  return {
    timestamp: at ?? startMs,
    startMs,
    endMs,
    from: goldDiffs[s.start],
    to: goldDiffs[s.end],
    swing: s.swing,
    title,
    detail: [...causes, movement].join(" "),
  };
}

type Facts = {
  deaths: Death[];
  // Enemy deaths you killed or assisted.
  myKills: ChampionKill[];
  // The kill of your opponent that you took part in, if any.
  killedOpponent: ChampionKill | null;
  soloKilledOpponent: boolean;
  // Your opponent died without your help.
  opponentDeaths: ChampionKill[];
  // Your teammates your opponent killed or helped kill.
  opponentKills: ChampionKill[];
  platesLost: number;
  platesTaken: number;
  csSwing: number;
};

function gatherFacts(ctx: TurningPointContext, s: Swing, inWindow: (t: number) => boolean): Facts {
  const meId = ctx.me.participantId;
  const oppId = ctx.opponent.participantId;
  const teamOf = new Map(ctx.participants.map((p) => [p.participantId, p.teamId]));
  const involves = (k: ChampionKill, id: number) =>
    k.killerId === id || k.assistingParticipantIds.includes(id);

  const kills = ctx.events.filter(
    (e): e is ChampionKill => e.type === "CHAMPION_KILL" && inWindow(e.timestamp),
  );
  const myKills = kills.filter(
    (k) => teamOf.get(k.victimId) !== ctx.me.teamId && involves(k, meId),
  );
  const killedOpponent = myKills.find((k) => k.victimId === oppId) ?? null;

  // Plates only matter to laners: the gold goes to whoever is nearby.
  const lane = laneOf(playedPosition(ctx.me));
  const plates = lane
    ? ctx.events.filter(
        (e): e is TurretPlateDestroyed =>
          e.type === "TURRET_PLATE_DESTROYED" &&
          inWindow(e.timestamp) &&
          e.laneType === LANE_TYPES[lane],
      )
    : [];
  // teamId is the team that lost the plate.
  const platesLost = plates.filter((e) => e.teamId === ctx.me.teamId).length;

  const csAt = (frame: number) =>
    playerAt(ctx.frames[frame], meId).cs - playerAt(ctx.frames[frame], oppId).cs;

  return {
    deaths: ctx.deaths.filter((d) => inWindow(d.timestamp)),
    myKills,
    killedOpponent,
    soloKilledOpponent:
      killedOpponent !== null &&
      killedOpponent.killerId === meId &&
      killedOpponent.assistingParticipantIds.length === 0,
    opponentDeaths: kills.filter((k) => k.victimId === oppId && !involves(k, meId)),
    opponentKills: kills.filter(
      (k) => k.victimId !== meId && teamOf.get(k.victimId) === ctx.me.teamId && involves(k, oppId),
    ),
    platesLost,
    platesTaken: plates.length - platesLost,
    csSwing: csAt(s.end) - csAt(s.start),
  };
}

// The headline for a swing that put you behind, from the most important cause.
function losingTitle(
  f: Facts,
  ctx: TurningPointContext,
  opp: string,
): { title: string; at?: number } {
  if (f.deaths.length === 1) {
    return { title: deathTitle(f.deaths[0], ctx), at: f.deaths[0].timestamp };
  }
  if (f.deaths.length > 1) {
    return { title: `Died ${times(f.deaths.length)}`, at: f.deaths[0].timestamp };
  }
  if (f.opponentKills.length > 0) {
    return { title: `${opp} found kills elsewhere`, at: f.opponentKills[0].timestamp };
  }
  if (f.platesLost > 0) return { title: `Lost ${plural(f.platesLost, "tower plate")}` };
  if (f.csSwing <= -NOTABLE_CS) return { title: `${opp} out-farmed you` };
  return { title: `${opp} pulled ahead` };
}

function winningTitle(f: Facts, opp: string): { title: string; at?: number } {
  if (f.killedOpponent) {
    return {
      title: f.soloKilledOpponent ? `Solo killed ${opp}` : `Killed ${opp}`,
      at: f.killedOpponent.timestamp,
    };
  }
  if (f.myKills.length > 0) {
    return {
      title: f.myKills.length === 1 ? "Got a kill" : `Got ${f.myKills.length} kills`,
      at: f.myKills[0].timestamp,
    };
  }
  if (f.opponentDeaths.length > 0) {
    return { title: `${opp} died to your team`, at: f.opponentDeaths[0].timestamp };
  }
  if (f.platesTaken > 0) return { title: `Took ${plural(f.platesTaken, "tower plate")}` };
  if (f.csSwing >= NOTABLE_CS) return { title: `Out-farmed ${opp}` };
  return { title: `Pulled ahead of ${opp}` };
}

// A solo death has one enemy in it. That's usually the enemy in your role, but
// in bot lane it can be either enemy bot laner (a support killing your ADC, or
// an ADC killing your support), so the title and sentence name whoever it was.
function deathTitle(d: Death, ctx: TurningPointContext): string {
  switch (d.label) {
    case "solo":
      return `Lost a 1v1 to ${listNames(d.enemyIds.map(ctx.name))}`;
    case "lane":
      return "Lost a 2v2 in lane";
    case "gank":
      return "Died to a gank";
    case "teamfight":
      return "Died in a teamfight";
    case "caught":
      return "Got caught out";
    case "executed":
      return "Died to a tower or minions";
  }
}

// How each kind of death reads in "You died twice, both to ganks."
const DEATH_PHRASES: Record<DeathLabel, [one: string, many: string]> = {
  solo: ["in a 1v1", "in 1v1s"],
  lane: ["in a 2v2", "in 2v2s"],
  gank: ["to a gank", "to ganks"],
  teamfight: ["in a teamfight", "in teamfights"],
  caught: ["caught out", "caught out"],
  executed: ["to a tower or minions", "to towers or minions"],
};

function losingCauses(f: Facts, ctx: TurningPointContext, opp: string): string[] {
  const causes: string[] = [];

  if (f.deaths.length === 1) {
    causes.push(deathSentence(f.deaths[0], ctx));
  } else if (f.deaths.length > 1) {
    const counts = new Map<DeathLabel, number>();
    for (const d of f.deaths) counts.set(d.label, (counts.get(d.label) ?? 0) + 1);
    if (counts.size === 1) {
      const [label] = counts.keys();
      const all = f.deaths.length === 2 ? "both" : "all";
      causes.push(`You died ${times(f.deaths.length)}, ${all} ${DEATH_PHRASES[label][1]}.`);
    } else {
      const parts = [...counts].map(
        ([label, n]) => `${n} ${DEATH_PHRASES[label][n === 1 ? 0 : 1]}`,
      );
      causes.push(`You died ${times(f.deaths.length)}: ${listNames(parts)}.`);
    }
  }

  if (f.opponentKills.length > 0) {
    const victims =
      f.opponentKills.length === 1
        ? "one of your teammates"
        : `${f.opponentKills.length} of your teammates`;
    causes.push(`${opp} helped kill ${victims} elsewhere on the map.`);
  }
  if (f.platesLost > 0) causes.push(`You lost ${plural(f.platesLost, "tower plate")}.`);
  if (f.csSwing <= -NOTABLE_CS) causes.push(`${opp} gained ${-f.csSwing} CS on you.`);
  if (causes.length === 0) {
    causes.push(
      `No deaths here: ${opp} earned more from farm, objectives and kills around the map.`,
    );
  }
  return causes;
}

function winningCauses(f: Facts, opp: string): string[] {
  const causes: string[] = [];

  if (f.killedOpponent) {
    const how = f.soloKilledOpponent
      ? `You killed ${opp} one on one.`
      : `You and your team killed ${opp}.`;
    causes.push(how);
    if (f.myKills.length > 1) {
      causes.push(`You took part in ${plural(f.myKills.length, "kill")} in total.`);
    }
  } else if (f.myKills.length > 0) {
    causes.push(`You took part in ${plural(f.myKills.length, "kill")}.`);
  }
  if (f.opponentDeaths.length > 0) {
    causes.push(`${opp} died ${times(f.opponentDeaths.length)} without you being involved.`);
  }
  if (f.platesTaken > 0) causes.push(`You took ${plural(f.platesTaken, "tower plate")}.`);
  if (f.csSwing >= NOTABLE_CS) causes.push(`You gained ${f.csSwing} CS on ${opp}.`);
  if (causes.length === 0) {
    causes.push(`No kills here: you earned more from farm, objectives and kills around the map.`);
  }
  return causes;
}

function deathSentence(d: Death, ctx: TurningPointContext): string {
  const names = listNames(d.enemyIds.map(ctx.name));
  switch (d.label) {
    case "solo":
      return `${names} killed you one on one.`;
    case "lane":
      return `${names} killed you in a 2v2.`;
    case "gank":
      return `${names} ganked you in your lane.`;
    case "teamfight":
      return `You died in a fight against ${d.enemyIds.length} enemies.`;
    case "caught":
      return laneOf(playedPosition(ctx.me))
        ? `${names} caught you away from your lane.`
        : `${names} caught you.`;
    case "executed":
      return "A tower or minions finished you off.";
  }
}
