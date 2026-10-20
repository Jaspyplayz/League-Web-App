// Phase ratings: a 0 to 100 rating for your early game, mid game and late
// game, next to the game score (score.ts), which stays the overall rating.
//
// Each phase is rated the same way as the game score, with its own trained
// model: take the stats from that slice of the game, compare each with
// what's normal for the role in that phase (a jungler's early CS isn't a top
// laner's), weight them by how much they went with winning, and rank the
// result among every saved player of the same role in the same phase. So 71
// means "rated higher than 71% of junglers' early games we've saved".
//
// The stats come from the timeline, minute by minute, so they're the ones it
// keeps: kills, deaths, assists, gold, XP, CS, damage to champions and epic
// monsters. Vision and objective damage only exist as end-of-game totals,
// which is one reason the overall rating stays the game score.
//
// Everything here is pure (games in, numbers out). scripts/train-phase-score.ts
// runs the training and saves the result in phase-score-model.json.

import { gameDurationSeconds } from "@/lib/match-summary";
import type { Match } from "@/lib/riot/types";
import {
  MIN_SCORED_SECONDS,
  rate,
  roleOf,
  ROLES,
  trainRoleModels,
  type Example,
  type Feature,
  type Rating,
  type Role,
  type RoleModels,
} from "./score";
import type { StudyGame } from "./tempo-study";
import type { TrimmedFrame, TrimmedTimeline } from "./trim";

// Early ends at 14:00, when turret plates fall. Mid ends at 25:00, roughly
// when Baron fights and full builds start. Late is the rest of the game.
export const PHASES = [
  { key: "early", label: "Early", from: 0, to: 14 },
  { key: "mid", label: "Mid", from: 14, to: 25 },
  { key: "late", label: "Late", from: 25, to: null },
] as const;
export type Phase = (typeof PHASES)[number];
export type PhaseKey = Phase["key"];

// A phase shorter than this isn't rated: a game that ends at 27 minutes has
// two minutes of late game, too little to judge. So a game needs 30 minutes
// for a late rating and 19 for a mid one.
export const MIN_PHASE_MINUTES = 5;

// The parts of a game the phase ratings read. Built from a saved match and
// its timeline (toPhaseGame) or from a tempo study game (fromStudyGame).
export type PhasePlayer = {
  participantId: number;
  teamId: number;
  role: Role;
  win: boolean;
};
export type PhaseGame = {
  matchId: string;
  players: PhasePlayer[];
  timeline: TrimmedTimeline;
};

// One player's numbers over one phase. Gold, XP, CS and damage are what they
// gained during it, not their totals so far.
type Totals = {
  kills: number;
  deaths: number;
  assists: number;
  gold: number;
  xp: number;
  cs: number;
  damage: number;
  epics: number; // epic monsters (dragons, grubs, Herald, Baron, Atakhan) they took part in
};

type Stats = {
  me: Totals;
  team: Totals[];
  // Null when nobody on the enemy team played the same role.
  opponent: Totals | null;
  // Epic monsters the team took. Not the sum of `team`, since five players
  // can take part in one dragon.
  teamEpics: number;
  minutes: number;
};

type PhaseFeature = Feature & { value: (s: Stats) => number };

const teamTotal = (s: Stats, stat: (t: Totals) => number) => sum(s.team.map(stat));
const share = (s: Stats, stat: (t: Totals) => number) =>
  stat(s.me) / Math.max(1, teamTotal(s, stat));
// Gained on your lane opponent during the phase, per minute.
const lead = (s: Stats, stat: (t: Totals) => number) =>
  s.opponent ? (stat(s.me) - stat(s.opponent)) / s.minutes : 0;

// What each phase's model looks at, in order, with which direction is better
// (see SCORE_FEATURES). Changing this list means retraining.
export const PHASE_FEATURES: readonly PhaseFeature[] = [
  {
    key: "kda",
    higherIsBetter: true,
    good: "strong KDA",
    bad: "weak KDA",
    value: (s) => Math.log1p((s.me.kills + s.me.assists) / Math.max(1, s.me.deaths)),
  },
  {
    key: "deathsPer10",
    higherIsBetter: false,
    good: "few deaths",
    bad: "many deaths",
    value: (s) => (s.me.deaths / s.minutes) * 10,
  },
  {
    key: "killParticipation",
    higherIsBetter: true,
    good: "high kill participation",
    bad: "low kill participation",
    value: (s) =>
      (s.me.kills + s.me.assists) /
      Math.max(
        1,
        teamTotal(s, (t) => t.kills),
      ),
  },
  {
    key: "damageShare",
    higherIsBetter: true,
    good: "big share of team damage",
    bad: "small share of team damage",
    value: (s) => share(s, (t) => t.damage),
  },
  {
    key: "damagePerMin",
    higherIsBetter: true,
    good: "high damage",
    bad: "low damage",
    value: (s) => s.me.damage / s.minutes,
  },
  {
    key: "goldShare",
    higherIsBetter: true,
    good: "big share of team gold",
    bad: "small share of team gold",
    value: (s) => share(s, (t) => t.gold),
  },
  {
    key: "csPerMin",
    higherIsBetter: true,
    good: "strong farm",
    bad: "weak farm",
    value: (s) => s.me.cs / s.minutes,
  },
  {
    key: "goldLeadPerMin",
    higherIsBetter: true,
    good: "gold gained on your opponent",
    bad: "gold lost to your opponent",
    value: (s) => lead(s, (t) => t.gold),
  },
  {
    key: "xpLeadPerMin",
    higherIsBetter: true,
    good: "XP gained on your opponent",
    bad: "XP lost to your opponent",
    value: (s) => lead(s, (t) => t.xp),
  },
  {
    key: "epicShare",
    higherIsBetter: true,
    good: "in on epic monsters",
    bad: "missed epic monsters",
    value: (s) => s.me.epics / Math.max(1, s.teamEpics),
  },
];

export type PhaseModel = {
  trainedAt: string;
  features: string[];
  phases: Partial<Record<PhaseKey, RoleModels & { games: number }>>;
};

export type PhaseRating = Rating & {
  phase: PhaseKey;
  label: string;
  // When the phase started and ended in this game, in minutes.
  fromMinute: number;
  toMinute: number;
};

// A game can be rated when it's long enough and every player has a role, so
// not ARAM, Arena, remakes or early surrenders.
export function toPhaseGame(match: Match, timeline: TrimmedTimeline): PhaseGame | null {
  const { participants } = match.info;
  if (gameDurationSeconds(match.info) < MIN_SCORED_SECONDS) return null;
  if (participants.some((p) => p.gameEndedInEarlySurrender)) return null;
  const players = participants.map((p) => ({
    participantId: p.participantId,
    teamId: p.teamId,
    role: roleOf(p),
    win: p.win,
  }));
  return checked(match.metadata.matchId, players, timeline);
}

// The tempo study's downloaded games (docs/tempo.md) have everything the
// ratings need, so they double as training data.
export function fromStudyGame(game: StudyGame): PhaseGame | null {
  if (game.durationS < MIN_SCORED_SECONDS) return null;
  const players = game.participants.map((p) => ({
    participantId: p.participantId,
    teamId: p.teamId,
    role: (ROLES as readonly string[]).includes(p.position) ? (p.position as Role) : null,
    win: p.win,
  }));
  return checked(game.matchId, players, game.timeline);
}

// Each team needs one player in each role, so everyone has an opponent.
function checked(
  matchId: string,
  players: (Omit<PhasePlayer, "role"> & { role: Role | null })[],
  timeline: TrimmedTimeline,
): PhaseGame | null {
  if (players.length !== 10) return null;
  for (const teamId of new Set(players.map((p) => p.teamId))) {
    const roles = new Set(players.filter((p) => p.teamId === teamId).map((p) => p.role));
    if (roles.size !== 5 || roles.has(null)) return null;
  }
  return { matchId, players: players as PhasePlayer[], timeline };
}

// Where a phase starts and ends in this game. Frames come once a minute, so
// frame 14 is 14:00, and the last frame is when the game ended. Null when
// the phase is too short to rate or the game ended before it.
export function phaseWindow(
  timeline: TrimmedTimeline,
  phase: Phase,
): {
  start: TrimmedFrame;
  end: TrimmedFrame;
  minutes: number;
  last: boolean;
} | null {
  const { frames } = timeline;
  const start = frames[phase.from];
  if (!start || frames.length < 2) return null;
  const finalFrame = frames[frames.length - 1];
  const end = (phase.to !== null && frames[phase.to]) || finalFrame;
  const minutes = (end.timestamp - start.timestamp) / 60_000;
  if (minutes < MIN_PHASE_MINUTES) return null;
  return { start, end, minutes, last: end === finalFrame };
}

// Every player's totals over one phase, by participantId.
function phaseTotals(game: PhaseGame, window: NonNullable<ReturnType<typeof phaseWindow>>) {
  const { start, end, last } = window;
  // The last phase keeps events right up to the end of the game.
  const inside = (t: number) => t >= start.timestamp && (last || t < end.timestamp);
  const totals = new Map<number, Totals>();
  for (const p of game.players) {
    const before = start.players[p.participantId - 1];
    const after = end.players[p.participantId - 1];
    totals.set(p.participantId, {
      kills: 0,
      deaths: 0,
      assists: 0,
      gold: after.gold - before.gold,
      xp: after.xp - before.xp,
      cs: after.cs - before.cs,
      damage: after.damage - before.damage,
      epics: 0,
    });
  }
  const teamEpics = new Map<number, number>();

  for (const e of game.timeline.events) {
    if (!inside(e.timestamp)) continue;
    if (e.type === "CHAMPION_KILL") {
      const killer = totals.get(e.killerId);
      if (killer) killer.kills++;
      const victim = totals.get(e.victimId);
      if (victim) victim.deaths++;
      for (const id of e.assistingParticipantIds) {
        const helper = totals.get(id);
        if (helper) helper.assists++;
      }
    } else if (e.type === "ELITE_MONSTER_KILL") {
      teamEpics.set(e.killerTeamId, (teamEpics.get(e.killerTeamId) ?? 0) + 1);
      for (const id of new Set([e.killerId, ...e.assistingParticipantIds])) {
        const helper = totals.get(id);
        if (helper) helper.epics++;
      }
    }
  }
  return { totals, teamEpics };
}

// Every player's stats for one phase, in PHASE_FEATURES order, keyed by
// participantId. Null when the phase can't be rated in this game.
export function phaseFeatures(game: PhaseGame, phase: Phase): Map<number, number[]> | null {
  const window = phaseWindow(game.timeline, phase);
  if (!window) return null;
  const { totals, teamEpics } = phaseTotals(game, window);

  return new Map(
    game.players.map((p) => {
      const opponent = game.players.find((q) => q.teamId !== p.teamId && q.role === p.role);
      const stats: Stats = {
        me: totals.get(p.participantId)!,
        team: game.players
          .filter((q) => q.teamId === p.teamId)
          .map((q) => totals.get(q.participantId)!),
        opponent: opponent ? totals.get(opponent.participantId)! : null,
        teamEpics: teamEpics.get(p.teamId) ?? 0,
        minutes: window.minutes,
      };
      return [p.participantId, PHASE_FEATURES.map((f) => f.value(stats))];
    }),
  );
}

// Turns one game into training examples: ten per phase it lasted long
// enough for.
export function phaseExamples(game: PhaseGame): Record<PhaseKey, Example[]> {
  const examples = { early: [], mid: [], late: [] } as Record<PhaseKey, Example[]>;
  for (const phase of PHASES) {
    const features = phaseFeatures(game, phase);
    if (!features) continue;
    for (const p of game.players) {
      examples[phase.key].push({
        matchId: game.matchId,
        role: p.role,
        features: features.get(p.participantId)!,
        win: p.win,
      });
    }
  }
  return examples;
}

// One player's rating for each phase the game lasted long enough for. Empty
// when the saved model was trained on a different feature list.
export function phaseRatings(
  game: PhaseGame,
  participantId: number,
  model: PhaseModel,
): PhaseRating[] {
  if (model.features.join() !== PHASE_FEATURES.map((f) => f.key).join()) return [];
  const player = game.players.find((p) => p.participantId === participantId);
  if (!player) return [];

  const ratings: PhaseRating[] = [];
  for (const phase of PHASES) {
    const phaseModel = model.phases[phase.key];
    const window = phaseWindow(game.timeline, phase);
    if (!phaseModel || !window) continue;
    // A role without saved games has no cut points to rank against.
    if (phaseModel.roles[player.role].cuts.length === 0) continue;
    const features = phaseFeatures(game, phase)!.get(participantId)!;
    ratings.push({
      phase: phase.key,
      label: phase.label,
      fromMinute: Math.round(window.start.timestamp / 60_000),
      toMinute: Math.round(window.end.timestamp / 60_000),
      ...rate(features, player.role, phaseModel, PHASE_FEATURES),
    });
  }
  return ratings;
}

// Trains one model per phase on the same games.
export function trainPhaseModel(games: PhaseGame[], trainedAt: Date): PhaseModel {
  const phases: PhaseModel["phases"] = {};
  const all = games.map(phaseExamples);
  for (const phase of PHASES) {
    const examples = all.flatMap((e) => e[phase.key]);
    if (examples.length === 0) continue;
    const games = new Set(examples.map((e) => e.matchId)).size;
    phases[phase.key] = { games, ...trainRoleModels(examples, PHASE_FEATURES) };
  }
  return {
    trainedAt: trainedAt.toISOString(),
    features: PHASE_FEATURES.map((f) => f.key),
    phases,
  };
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
