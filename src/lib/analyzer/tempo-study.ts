// The tempo study: checks the tempo timeline (tempo.ts) against real games.
// scripts/collect-tempo-games.ts downloads games into a local folder, and
// scripts/study-tempo.ts runs the checks in this file on them and prints a
// report. See docs/tempo.md for what was checked and what came out.
//
// Everything here is pure, like the rest of the analyzer: games in, numbers
// out, so each check has a unit test.

import type { Match, Timeline } from "@/lib/riot/types";
import { isAnalyzable } from "./index";
import { playedPosition } from "./matchup";
import {
  deathSpans,
  itemGoldAt,
  shopVisits,
  tempoTimeline,
  type ObjectiveWindow,
  type TempoTone,
} from "./tempo";
import { trimTimeline, type ChampionKill, type TrimmedEvent, type TrimmedTimeline } from "./trim";

// Where the collector saves games, one JSON file each. Git ignores .cache.
export const STUDY_FOLDER = ".cache/tempo-study";

// One downloaded game, with only what the study reads. No names or PUUIDs.
export type StudyGame = {
  matchId: string;
  region: string;
  // The rank of the player whose match history the game came from. The other
  // nine players are usually close to it.
  tier: string;
  patch: string; // "16.20"
  durationS: number;
  participants: StudyParticipant[];
  timeline: TrimmedTimeline;
  // A few per-minute numbers the site doesn't keep, so the study can test
  // whether they would help: extra[frame][participantId - 1].
  extra: StudyExtra[][];
};

export type StudyParticipant = {
  participantId: number;
  teamId: number;
  position: string; // "JUNGLE", ...
  championName: string;
  win: boolean;
};

export type StudyExtra = {
  health: number;
  healthMax: number;
  // Monsters only. The site's cs counts minions and monsters together.
  jungleCs: number;
};

// Ranked solo/duo games of 15 minutes or more with exactly one jungler on
// each side. Null for anything else.
export function toStudyGame(
  match: Match,
  timeline: Timeline,
  tier: string,
  region: string,
): StudyGame | null {
  if (match.info.queueId !== 420 || !isAnalyzable(match)) return null;
  const { participants } = match.info;
  const junglers = participants.filter((p) => playedPosition(p) === "JUNGLE");
  const sides = new Set(junglers.map((p) => p.teamId));
  if (junglers.length !== 2 || sides.size !== 2) return null;

  return {
    matchId: match.metadata.matchId,
    region,
    tier,
    patch: match.info.gameVersion.split(".").slice(0, 2).join("."),
    durationS: match.info.gameDuration,
    participants: participants.map((p) => ({
      participantId: p.participantId,
      teamId: p.teamId,
      position: playedPosition(p),
      championName: p.championName,
      win: p.win,
    })),
    timeline: trimTimeline(timeline),
    extra: timeline.info.frames.map((frame) =>
      Array.from({ length: 10 }, (_, i) => {
        const p = frame.participantFrames[String(i + 1)] as
          | (Record<string, unknown> & { jungleMinionsKilled?: number })
          | undefined;
        const stats = (p?.championStats ?? {}) as Record<string, unknown>;
        return {
          health: num(stats.health),
          healthMax: num(stats.healthMax),
          jungleCs: num(p?.jungleMinionsKilled),
        };
      }),
    ),
  };
}

function num(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

// --- One row per minute ---

// What the study measures at each minute mark, always blue side's jungler
// minus red side's (or blue's team minus red's), so positive means blue is
// ahead.
export const STUDY_FEATURES = [
  "gold", // junglers' total gold earned
  "itemGold", // junglers' gold spent on items (exact, from unspent gold)
  "itemGoldEst", // the same, estimated from shop visits as for older games
  "unspent", // junglers' gold not spent yet
  "level",
  "xp",
  "alive", // 1 if only blue's jungler is alive, -1 if only red's
  "numbers", // players alive on blue minus on red
  // The same two from Riot's health snapshots (health above 0) instead of
  // kill times and the death timer formula. The site doesn't keep health.
  "aliveHp",
  "numbersHp",
  "teamGold", // the two teams' total gold
  "hp", // junglers' health as a share of their maximum (0 to 1)
  "jungleCs2", // monsters killed by the junglers in the last 2 minutes
  "sinceShop", // minutes since the jungler last shopped
  "lead", // the tempo timeline's lead (items + levels)
  "leadEst", // the same with estimated item gold
] as const;
export type StudyFeature = (typeof STUDY_FEATURES)[number];

export type StudyRow = {
  matchId: string;
  tier: string;
  region: string;
  minute: number;
  f: Record<StudyFeature, number>;
  // The two junglers' average total gold, for testing a lead measured as a
  // share of what they have rather than in plain gold.
  size: number;
  // The tempo timeline's call from blue's side, with exact and estimated item gold.
  tone: TempoTone;
  toneEst: TempoTone;
  // Did blue's side win the next jungler fight or epic monster within a
  // minute of this mark? Null when nothing happened.
  nextPlay: 0 | 1 | null;
  // Seconds since the last champion kill anywhere on the map, to tell
  // minutes in the middle of a fight from quiet ones. Infinity before the
  // first kill.
  sinceKillS: number;
};

// An epic monster taken, with the tempo call just before and a minute before.
export type ObjectiveRow = {
  matchId: string;
  tier: string;
  kind: ObjectiveWindow["kind"];
  spawnsAt: number;
  takenAt: number;
  blueTook: boolean;
  // The last minute mark before it was taken, and the last one at least a
  // minute before it, so a fight that started just before the mark can't
  // give the answer away.
  before: StudyRow | null;
  minuteBefore: StudyRow | null;
  // The mark when it spawned (spawns are on whole minutes). Null when it
  // spawned before 2:00 or the row is missing.
  atSpawn: StudyRow | null;
};

// A fight where one jungler died with the other jungler taking part.
export type DuelRow = { matchId: string; tier: string; at: number; blueWon: boolean; before: StudyRow | null };

export type StudyRows = { minutes: StudyRow[]; objectives: ObjectiveRow[]; duels: DuelRow[] };

// How long after a minute mark something counts as the next play.
export const NEXT_PLAY_MS = 60_000;
// Minute 1 is still the walk to the first camp, so the study starts at 2.
const FIRST_MINUTE = 2;

// `nextPlayMs` is how long after a mark something counts as the next play;
// the study also tries other windows to check the results don't hang on it.
export function studyRows(game: StudyGame, nextPlayMs = NEXT_PLAY_MS): StudyRows {
  const blue = game.participants.find((p) => p.teamId === 100 && p.position === "JUNGLE")!;
  const red = game.participants.find((p) => p.teamId === 200 && p.position === "JUNGLE")!;
  const { timeline } = game;
  const { frames, events } = timeline;
  const exact = tempoTimeline(timeline, game.participants, blue.participantId, red.participantId);
  const estimated = tempoTimeline(
    withoutUnspentGold(timeline),
    game.participants,
    blue.participantId,
    red.participantId,
  );
  const teamGold = (i: number, teamId: number) =>
    game.participants
      .filter((p) => p.teamId === teamId)
      .reduce((total, p) => total + frames[i].players[p.participantId - 1].gold, 0);
  const extra = (i: number, id: number) => game.extra[i]?.[id - 1];
  const healthShare = (i: number, id: number) => {
    const e = extra(i, id);
    return e && e.healthMax > 0 ? e.health / e.healthMax : 0;
  };
  const jungleCs2 = (i: number, id: number) =>
    (extra(i, id)?.jungleCs ?? 0) - (extra(Math.max(0, i - 2), id)?.jungleCs ?? 0);
  const hasHealth = game.extra.some((frame) => frame.some((p) => p.healthMax > 0));
  const up = (i: number, id: number) => (extra(i, id)?.health ?? 0) > 0;
  const upOn = (i: number, teamId: number) =>
    game.participants.filter((p) => p.teamId === teamId && up(i, p.participantId)).length;
  const plays = playsOf(events, game.participants, [blue.participantId, red.participantId]);
  const kills = events.filter((e): e is ChampionKill => e.type === "CHAMPION_KILL");

  const rows: StudyRow[] = [];
  for (const [index, m] of exact.minutes.entries()) {
    const i = index + 1; // minutes[0] is frame 1
    const minute = Math.round(m.timestamp / 60_000);
    if (minute < FIRST_MINUTE) continue;
    const est = estimated.minutes[index];
    const sinceShop = (lastShop: number | null) => (m.timestamp - (lastShop ?? 0)) / 60_000;
    const next = plays.find((p) => p.timestamp > m.timestamp && p.timestamp <= m.timestamp + nextPlayMs);
    const lastKill = kills.findLast((k) => k.timestamp <= m.timestamp);
    rows.push({
      matchId: game.matchId,
      tier: game.tier,
      region: game.region,
      minute,
      f: {
        gold: m.you.gold - m.them.gold,
        itemGold: m.you.itemGold - m.them.itemGold,
        itemGoldEst: est.you.itemGold - est.them.itemGold,
        unspent: m.you.unspentGold - m.them.unspentGold,
        level: m.you.level - m.them.level,
        xp: frames[i].players[blue.participantId - 1].xp - frames[i].players[red.participantId - 1].xp,
        alive: Number(m.you.alive) - Number(m.them.alive),
        numbers: m.alive.ours - m.alive.theirs,
        aliveHp: hasHealth
          ? Number(up(i, blue.participantId)) - Number(up(i, red.participantId))
          : Number(m.you.alive) - Number(m.them.alive),
        numbersHp: hasHealth ? upOn(i, 100) - upOn(i, 200) : m.alive.ours - m.alive.theirs,
        teamGold: teamGold(i, 100) - teamGold(i, 200),
        hp: healthShare(i, blue.participantId) - healthShare(i, red.participantId),
        jungleCs2: jungleCs2(i, blue.participantId) - jungleCs2(i, red.participantId),
        sinceShop: sinceShop(m.you.lastShop) - sinceShop(m.them.lastShop),
        lead: m.lead,
        leadEst: est.lead,
      },
      size: (m.you.gold + m.them.gold) / 2,
      tone: m.tone,
      toneEst: est.tone,
      nextPlay: next ? (next.blueWon ? 1 : 0) : null,
      sinceKillS: lastKill ? (m.timestamp - lastKill.timestamp) / 1000 : Infinity,
    });
  }

  const rowAt = (t: number) => rows.findLast((r) => r.minute * 60_000 <= t) ?? null;
  const rowBefore = (t: number) => rows.findLast((r) => r.minute * 60_000 < t) ?? null;
  const objectives: ObjectiveRow[] = exact.objectives
    .filter((w) => w.takenAt !== null && w.ours !== null)
    .map((w) => ({
      matchId: game.matchId,
      tier: game.tier,
      kind: w.kind,
      spawnsAt: w.spawnsAt,
      takenAt: w.takenAt!,
      blueTook: w.ours!,
      before: rowBefore(w.takenAt!),
      minuteBefore: rowAt(w.takenAt! - 60_000),
      atSpawn: rows.find((r) => r.minute * 60_000 === w.spawnsAt) ?? null,
    }));

  const blueId = blue.participantId;
  const redId = red.participantId;
  const duels: DuelRow[] = events
    .filter((e): e is ChampionKill => e.type === "CHAMPION_KILL")
    .filter((k) => {
      const takers = [k.killerId, ...k.assistingParticipantIds];
      return (
        (k.victimId === blueId && takers.includes(redId)) ||
        (k.victimId === redId && takers.includes(blueId))
      );
    })
    .map((k) => ({
      matchId: game.matchId,
      tier: game.tier,
      at: k.timestamp,
      blueWon: k.victimId === redId,
      before: rowBefore(k.timestamp),
    }));

  return { minutes: rows, objectives, duels };
}

// --- Checks on the inputs ---

// A check on the death timer estimate, if Riot reports a dead champion's
// health as 0 at a snapshot: at every minute mark, for every player, does
// "dead by the death timer" agree with "health 0"? Games whose snapshots
// carry no health at all are skipped.
export function aliveCheck(game: StudyGame): {
  bothDead: number;
  timerOnly: number;
  healthOnly: number;
  bothAlive: number;
} {
  const counts = { bothDead: 0, timerOnly: 0, healthOnly: 0, bothAlive: 0 };
  const { frames } = game.timeline;
  if (!game.extra.some((frame) => frame.some((p) => p.healthMax > 0))) return counts;
  const deaths = deathSpans(game.timeline);
  for (let i = 1; i < frames.length - 1; i++) {
    const t = frames[i].timestamp;
    for (let id = 1; id <= 10; id++) {
      const timerDead = deaths.some((d) => d.participantId === id && d.diedAt <= t && t < d.respawnAt);
      const healthDead = (game.extra[i]?.[id - 1]?.health ?? 1) <= 0;
      if (timerDead && healthDead) counts.bothDead++;
      else if (timerDead) counts.timerOnly++;
      else if (healthDead) counts.healthOnly++;
      else counts.bothAlive++;
    }
  }
  return counts;
}

// One death, for checking the death timer formula against Riot's health
// snapshots: at the first minute mark after the death, was the player still
// at 0 health? If the formula is right, they were exactly when the timer
// hadn't run out yet (gapS < timerS).
export type RespawnRow = {
  minute: number; // when they died, in game minutes
  level: number;
  timerS: number; // the formula's death timer, in seconds
  gapS: number; // seconds from the death to the next minute mark
  deadAtMark: boolean; // health 0 at that mark
  // Something could have brought them back early: they'd bought Guardian
  // Angel, Zilean or Akshan was on their team, or they were Sion, Zac or
  // Anivia, whose passives keep them going after a kill.
  revive: boolean;
};

const GUARDIAN_ANGEL = 3026;
const REVIVING_TEAMMATES = new Set(["Zilean", "Akshan"]);
const OWN_REVIVES = new Set(["Sion", "Zac", "Anivia"]);

export function respawnRows(game: StudyGame): RespawnRow[] {
  const { frames } = game.timeline;
  if (!game.extra.some((frame) => frame.some((p) => p.healthMax > 0))) return [];
  const deaths = deathSpans(game.timeline);
  const rows: RespawnRow[] = [];
  for (const d of deaths) {
    // The first snapshot after the death, leaving out the end of the game.
    const i = frames.findIndex((f) => f.timestamp > d.diedAt);
    if (i === -1 || i >= frames.length - 1) continue;
    const mark = frames[i].timestamp;
    // Dying again before the mark would make the snapshot about that death.
    const again = deaths.some(
      (o) => o.participantId === d.participantId && o.diedAt > d.diedAt && o.diedAt <= mark,
    );
    const timerS = (d.respawnAt - d.diedAt) / 1000;
    const gapS = (mark - d.diedAt) / 1000;
    // Long back by the mark: says nothing about the timer.
    if (again || gapS > 2 * timerS) continue;
    const frame = frames.findLast((f) => f.timestamp <= d.diedAt) ?? frames[0];
    const victim = game.participants.find((p) => p.participantId === d.participantId);
    const boughtAngel = game.timeline.events.some(
      (e) =>
        e.type === "ITEM_PURCHASED" &&
        e.participantId === d.participantId &&
        e.itemId === GUARDIAN_ANGEL &&
        e.timestamp < d.diedAt,
    );
    rows.push({
      minute: d.diedAt / 60_000,
      level: frame.players[d.participantId - 1].level,
      timerS,
      gapS,
      deadAtMark: (game.extra[i]?.[d.participantId - 1]?.health ?? 1) <= 0,
      revive:
        boughtAngel ||
        OWN_REVIVES.has(victim?.championName ?? "") ||
        game.participants.some(
          (p) => p.teamId === victim?.teamId && REVIVING_TEAMMATES.has(p.championName),
        ),
    });
  }
  return rows;
}

// For each jungler at each minute mark: the exact item gold minus the
// estimate made from shop visits (as for timelines saved without unspent
// gold), plus the simpler estimate "gold at the snapshot before the visit".
export function estimateErrors(game: StudyGame): { line: number; before: number }[] {
  const { timeline } = game;
  const { frames } = timeline;
  if (!frames.slice(1).every((f) => f.players.every((p) => p.unspentGold !== undefined))) return [];
  const deaths = deathSpans(timeline);
  const errors: { line: number; before: number }[] = [];
  for (const p of game.participants.filter((x) => x.position === "JUNGLE")) {
    const id = p.participantId;
    const visits = shopVisits(timeline, id, deaths);
    const bare = withoutUnspentGold(timeline).frames;
    for (let i = FIRST_MINUTE; i < frames.length - 1; i++) {
      const exact = itemGoldAt(frames, i, id, visits);
      const line = itemGoldAt(bare, i, id, visits);
      const last = visits.findLast((v) => v.timestamp <= frames[i].timestamp);
      const before = last
        ? (frames.findLast((f) => f.timestamp <= last.timestamp) ?? frames[0]).players[id - 1].gold
        : 0;
      errors.push({ line: exact - line, before: exact - before });
    }
  }
  return errors;
}

type Play = { timestamp: number; blueWon: boolean };

// Every kill a jungler took part in (as killer, helper or victim) and every
// epic monster taken, in order, with whether blue's side came out ahead.
export function playsOf(
  events: TrimmedEvent[],
  participants: StudyParticipant[],
  junglerIds: number[],
): Play[] {
  const teamOf = new Map(participants.map((p) => [p.participantId, p.teamId]));
  const plays: Play[] = [];
  for (const e of events) {
    if (e.type === "CHAMPION_KILL") {
      const involved = [e.killerId, e.victimId, ...e.assistingParticipantIds];
      if (!involved.some((id) => junglerIds.includes(id))) continue;
      plays.push({ timestamp: e.timestamp, blueWon: teamOf.get(e.victimId) === 200 });
    } else if (e.type === "ELITE_MONSTER_KILL" && EPIC_MONSTERS.has(e.monsterType)) {
      plays.push({ timestamp: e.timestamp, blueWon: e.killerTeamId === 100 });
    }
  }
  return plays.sort((a, b) => a.timestamp - b.timestamp);
}

const EPIC_MONSTERS = new Set(["DRAGON", "HORDE", "RIFTHERALD", "BARON_NASHOR"]);

function withoutUnspentGold(timeline: TrimmedTimeline): TrimmedTimeline {
  return {
    ...timeline,
    frames: timeline.frames.map((f) => ({
      ...f,
      players: f.players.map((p) => {
        const copy = { ...p };
        delete copy.unspentGold;
        return copy;
      }),
    })),
  };
}

// --- Measuring ---

// The chance that a randomly picked moment blue won scores higher than a
// randomly picked moment blue lost (the area under the ROC curve). 0.5 means
// the score tells you nothing; 1 means it always ranks the winner higher.
// Ties count half.
export function auc(points: { score: number; won: boolean }[]): number {
  const sorted = [...points].sort((a, b) => a.score - b.score);
  let rankSum = 0;
  let wins = 0;
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j < sorted.length && sorted[j].score === sorted[i].score) j++;
    // Ranks i+1 .. j share their average.
    const rank = (i + 1 + j) / 2;
    for (let k = i; k < j; k++) {
      if (sorted[k].won) {
        rankSum += rank;
        wins++;
      }
    }
    i = j;
  }
  const losses = sorted.length - wins;
  if (wins === 0 || losses === 0) return 0.5;
  return (rankSum - (wins * (wins + 1)) / 2) / (wins * losses);
}

// How often the side a call favours came out ahead, over the calls that
// favoured a side. `share` is how many of all the moments got a call.
export function callAccuracy(points: { tone: TempoTone; won: boolean }[]): {
  calls: number;
  share: number;
  right: number;
} {
  const called = points.filter((p) => p.tone !== "even");
  const right = called.filter((p) => (p.tone === "ahead") === p.won).length;
  return {
    calls: called.length,
    share: points.length ? called.length / points.length : 0,
    right: called.length ? right / called.length : 0,
  };
}

// Logistic regression with Newton's method, for the study's small feature
// sets: the best weights for predicting `won` from `x`, plus a constant
// (blue side's edge, if any). A small penalty keeps it stable when a feature
// barely varies.
export function fitLogistic(
  rows: { x: number[]; won: boolean }[],
  { steps = 25, l2 = 1e-4 } = {},
): number[] {
  const width = (rows[0]?.x.length ?? 0) + 1;
  const w = new Array<number>(width).fill(0);
  for (let step = 0; step < steps; step++) {
    const grad = new Array<number>(width).fill(0);
    const hess = Array.from({ length: width }, () => new Array<number>(width).fill(0));
    for (const r of rows) {
      const x = [1, ...r.x];
      const p = sigmoid(dot(w, x));
      const g = p - (r.won ? 1 : 0);
      const h = p * (1 - p);
      for (let a = 0; a < width; a++) {
        grad[a] += g * x[a];
        for (let b = 0; b < width; b++) hess[a][b] += h * x[a] * x[b];
      }
    }
    for (let a = 0; a < width; a++) {
      grad[a] += l2 * rows.length * w[a];
      hess[a][a] += l2 * rows.length;
    }
    const delta = solve(hess, grad);
    let moved = 0;
    for (let a = 0; a < width; a++) {
      w[a] -= delta[a];
      moved = Math.max(moved, Math.abs(delta[a]));
    }
    if (moved < 1e-9) break;
  }
  return w;
}

export function predict(w: number[], x: number[]): number {
  return sigmoid(dot(w, [1, ...x]));
}

// Fits on four fifths of the games and predicts the other fifth, five
// times over, so every prediction comes from weights that never saw that
// game. Returns the average log loss (lower is better; always guessing 50%
// scores 0.693) and the AUC of the predictions.
export function crossValidated(
  rows: { matchId: string; x: number[]; won: boolean }[],
  folds = 5,
): { logLoss: number; auc: number } {
  const ids = [...new Set(rows.map((r) => r.matchId))].sort();
  const fold = new Map(ids.map((id) => [id, hash(id) % folds]));
  const predictions: { score: number; won: boolean }[] = [];
  let loss = 0;
  for (let k = 0; k < folds; k++) {
    const test = rows.filter((r) => fold.get(r.matchId) === k);
    if (test.length === 0) continue;
    const w = fitLogistic(rows.filter((r) => fold.get(r.matchId) !== k));
    for (const r of test) {
      const p = Math.min(1 - 1e-9, Math.max(1e-9, predict(w, r.x)));
      loss -= r.won ? Math.log(p) : Math.log(1 - p);
      predictions.push({ score: p, won: r.won });
    }
  }
  return { logLoss: loss / Math.max(1, predictions.length), auc: auc(predictions) };
}

// A stable number for a match ID, to split games into folds the same way
// every run.
export function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

// Gaussian elimination: solves a x = b for a small square matrix.
function solve(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    if (Math.abs(m[col][col]) < 1e-12) continue;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = m[r][col] / m[col][col];
      for (let c = col; c <= n; c++) m[r][c] -= factor * m[col][c];
    }
  }
  return m.map((row, i) => (Math.abs(row[i]) < 1e-12 ? 0 : row[n] / row[i]));
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function dot(a: number[], b: number[]): number {
  return a.reduce((total, x, i) => total + x * b[i], 0);
}
