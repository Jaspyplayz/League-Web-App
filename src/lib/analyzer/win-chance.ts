// Turnpoint's win chance: each team's chance of winning at every minute of a
// finished game, like the win probability line on sports broadcasts.
//
// It's a small machine learning model (logistic regression) trained on saved
// games. For every minute of every game, it sees how far ahead blue side was
// (gold, XP, kills, towers, dragons, buffs...) and which side won in the end.
// It learns one weight per stat, so a 2,000 gold lead at minute 12 can be
// turned into "blue wins about 65% of games like this".
//
// It only ever runs on finished games. Riot's policy doesn't allow live-game
// predictions, and Turnpoint never fetches live games anyway.
//
// Everything here is pure (games in, numbers out). scripts/train-win-chance.ts
// runs the training and saves the result in win-chance-model.json. See
// docs/win-chance.md for the formula with a worked example.

import type { Match } from "@/lib/riot/types";
import { TIERS, tierName, type Tier } from "@/lib/tiers";
import { isScorable, toScoreGame } from "./score";
import type { TrimmedEvent, TrimmedFrame, TrimmedTimeline } from "./trim";

// What we record about each team at each minute, in this order. Saved as
// plain arrays (not objects) so thousands of games stay a few MB.
export const TEAM_STATS = [
  "gold", // total gold earned by the five players
  "xp", // total XP of the five players
  "kills", // champion kills
  "towers", // enemy towers destroyed
  "inhibitors", // enemy inhibitors down right now (they respawn after 5 minutes)
  "dragons", // elemental dragons, not counting Elder
  "elderBuff", // 1 while the team has the Elder Dragon buff
  "baronBuff", // 1 while the team has the Baron buff
  "grubs", // void grubs
  "heralds", // Rift Heralds
  "atakhans", // Atakhan
] as const;
export type TeamStat = (typeof TEAM_STATS)[number];
export type TeamState = Record<TeamStat, number>;

// One moment of a game: seconds since the start, then blue side's and red
// side's numbers in TEAM_STATS order.
export type WinChanceFrame = { t: number; blue: number[]; red: number[] };

// The only parts of a game the model reads. The benchmark job saves these
// (the win_chance_games table), with no names or PUUIDs in them.
export type WinChanceGame = {
  matchId: string;
  patch: string; // "16.20"
  blueWin: boolean;
  frames: WinChanceFrame[];
  // The ranked tier the game was played at ("GOLD"): the tier of the
  // benchmark player it was collected from. Players in one game are matched
  // by MMR, so the other nine are close to it. Missing for games opened on
  // the site, which only train the all-ranks model.
  tier?: string;
};

// How long buffs last and how long an inhibitor stays down, in ms.
const INHIBITOR_RESPAWN_MS = 5 * 60_000;
const BARON_BUFF_MS = 3 * 60_000;
const ELDER_BUFF_MS = 150_000;

// The patch a game was played on: "16.20.712.3456" becomes "16.20".
export function patchOf(gameVersion: string): string {
  return gameVersion.split(".").slice(0, 2).join(".");
}

// Sorts patches oldest first ("16.9" before "16.10").
export function comparePatches(a: string, b: string): number {
  const [aMajor = 0, aMinor = 0] = a.split(".").map(Number);
  const [bMajor = 0, bMinor = 0] = b.split(".").map(Number);
  return aMajor - bMajor || aMinor - bMinor;
}

// Boils a finished game down to each team's numbers at each minute. Null for
// games the model can't learn from: the same ones the game score skips
// (ARAM, Arena, remakes, early surrenders and games under 10 minutes).
export function toWinChanceGame(match: Match, timeline: TrimmedTimeline): WinChanceGame | null {
  if (!isScorable(toScoreGame(match))) return null;
  const { participants } = match.info;
  const blueWin = participants.find((p) => p.teamId === 100)?.win;
  if (blueWin === undefined) return null;

  const teamOf = new Map(participants.map((p) => [p.participantId, p.teamId]));
  const frames = timeline.frames.map((frame) => {
    const blue = teamStateAt(frame, timeline.events, teamOf, 100);
    const red = teamStateAt(frame, timeline.events, teamOf, 200);
    return {
      t: Math.round(frame.timestamp / 1000),
      blue: TEAM_STATS.map((stat) => blue[stat]),
      red: TEAM_STATS.map((stat) => red[stat]),
    };
  });
  return { matchId: match.metadata.matchId, patch: patchOf(match.info.gameVersion), blueWin, frames };
}

// One team's numbers at one frame of the game. `teamOf` maps each
// participantId to their team.
export function teamStateAt(
  frame: TrimmedFrame,
  events: TrimmedEvent[],
  teamOf: Map<number, number>,
  teamId: number,
): TeamState {
  const at = frame.timestamp;
  const ours = (participantId: number) => teamOf.get(participantId) === teamId;
  const state: TeamState = {
    gold: 0,
    xp: 0,
    kills: 0,
    towers: 0,
    inhibitors: 0,
    dragons: 0,
    elderBuff: 0,
    baronBuff: 0,
    grubs: 0,
    heralds: 0,
    atakhans: 0,
  };
  frame.players.forEach((p, i) => {
    if (!ours(i + 1)) return;
    state.gold += p.gold;
    state.xp += p.xp;
  });

  for (const e of events) {
    if (e.timestamp > at) continue;
    const ago = at - e.timestamp;
    switch (e.type) {
      case "CHAMPION_KILL":
        // Counted by who died, so executions (no champion killer) count too.
        if (!ours(e.victimId) && teamOf.has(e.victimId)) state.kills++;
        break;
      case "BUILDING_KILL":
        // teamId is the team that lost the building.
        if (e.teamId === teamId) break;
        if (e.buildingType === "TOWER_BUILDING") state.towers++;
        if (e.buildingType === "INHIBITOR_BUILDING" && ago < INHIBITOR_RESPAWN_MS) state.inhibitors++;
        break;
      case "ELITE_MONSTER_KILL":
        if (e.killerTeamId !== teamId) break;
        if (e.monsterType === "DRAGON" && e.monsterSubType === "ELDER_DRAGON") {
          if (ago < ELDER_BUFF_MS) state.elderBuff = 1;
        } else if (e.monsterType === "DRAGON") {
          state.dragons++;
        } else if (e.monsterType === "BARON_NASHOR") {
          if (ago < BARON_BUFF_MS) state.baronBuff = 1;
        } else if (e.monsterType === "HORDE") {
          state.grubs++;
        } else if (e.monsterType === "RIFTHERALD") {
          state.heralds++;
        } else if (e.monsterType === "ATAKHAN") {
          state.atakhans++;
        }
        break;
    }
  }
  return state;
}

export function readTeam(values: number[]): TeamState {
  return Object.fromEntries(TEAM_STATS.map((stat, i) => [stat, values[i] ?? 0])) as TeamState;
}

// What the model looks at: how far ahead blue side is, so 0 means even.
// Red side's chance is always 100% minus blue's.
//
// `alwaysHelps` is the one thing we tell it up front: being further ahead
// in gold or towers never makes you less likely to win. It learns how much
// each lead is worth. "goldLate" is the gold lead again, scaled by how late
// it is, so the model can learn that a 2,000 gold lead matters more at
// minute 10 than at minute 35, when everyone has full builds.
//
// Changing this list means retraining: a saved model trained on a different
// list is ignored (see winChanceCurve).
export const WIN_CHANCE_FEATURES = [
  {
    key: "gold",
    label: "gold lead, per 1,000",
    alwaysHelps: true,
    value: (b: TeamState, r: TeamState) => (b.gold - r.gold) / 1000,
  },
  {
    key: "goldLate",
    label: "gold lead per 1,000, times minutes / 30",
    alwaysHelps: false,
    value: (b: TeamState, r: TeamState, minutes: number) => ((b.gold - r.gold) / 1000) * (minutes / 30),
  },
  {
    key: "xp",
    label: "XP lead, per 1,000",
    alwaysHelps: true,
    value: (b: TeamState, r: TeamState) => (b.xp - r.xp) / 1000,
  },
  {
    key: "kills",
    label: "kill lead",
    alwaysHelps: true,
    value: (b: TeamState, r: TeamState) => b.kills - r.kills,
  },
  {
    key: "towers",
    label: "tower lead",
    alwaysHelps: true,
    value: (b: TeamState, r: TeamState) => b.towers - r.towers,
  },
  {
    key: "inhibitors",
    label: "inhibitors down lead",
    alwaysHelps: true,
    value: (b: TeamState, r: TeamState) => b.inhibitors - r.inhibitors,
  },
  {
    key: "dragons",
    label: "dragon lead",
    alwaysHelps: true,
    value: (b: TeamState, r: TeamState) => b.dragons - r.dragons,
  },
  {
    key: "soul",
    label: "dragon soul (1 if blue has it, -1 if red has it)",
    alwaysHelps: true,
    value: (b: TeamState, r: TeamState) => Number(b.dragons >= 4) - Number(r.dragons >= 4),
  },
  {
    key: "elderBuff",
    label: "Elder buff (1 blue, -1 red)",
    alwaysHelps: true,
    value: (b: TeamState, r: TeamState) => b.elderBuff - r.elderBuff,
  },
  {
    key: "baronBuff",
    label: "Baron buff (1 blue, -1 red)",
    alwaysHelps: true,
    value: (b: TeamState, r: TeamState) => b.baronBuff - r.baronBuff,
  },
  {
    key: "grubs",
    label: "void grub lead",
    alwaysHelps: true,
    value: (b: TeamState, r: TeamState) => b.grubs - r.grubs,
  },
  {
    key: "heralds",
    label: "Rift Herald lead",
    alwaysHelps: true,
    value: (b: TeamState, r: TeamState) => b.heralds - r.heralds,
  },
  {
    key: "atakhans",
    label: "Atakhan lead",
    alwaysHelps: true,
    value: (b: TeamState, r: TeamState) => b.atakhans - r.atakhans,
  },
] as const;

export function winChanceFeatures(frame: WinChanceFrame): number[] {
  const blue = readTeam(frame.blue);
  const red = readTeam(frame.red);
  return WIN_CHANCE_FEATURES.map((f) => f.value(blue, red, frame.t / 60));
}

// One minute of one game, ready for training.
export type Example = {
  matchId: string;
  patch: string;
  minute: number;
  features: number[];
  blueWin: boolean;
  tier?: string;
};

export function winChanceExamples(game: WinChanceGame): Example[] {
  return game.frames
    // The first frame is the loading screen: everything is 0, so it can't
    // teach anything.
    .filter((frame) => frame.t > 0)
    .map((frame) => ({
      matchId: game.matchId,
      patch: game.patch,
      minute: frame.t / 60,
      features: winChanceFeatures(frame),
      blueWin: game.blueWin,
      tier: game.tier,
    }));
}

// How the model did on games it wasn't trained on (see crossValidate).
export type Evaluation = {
  examples: number;
  // How many minutes it picked the eventual winner of (over 50% for them).
  accuracy: number;
  // Lower is better. Log loss punishes being confidently wrong; a coin flip
  // (always 50%) scores 0.693. Brier score is the average squared miss; a
  // coin flip scores 0.25.
  logLoss: number;
  brier: number;
  // Accuracy at a few points in the game, next to the simplest possible
  // rule ("the team with more gold wins") so we can see the model beats it.
  byMinute: { minute: number; examples: number; accuracy: number; goldRule: number }[];
  // When it says 60-70%, does that team win about 65% of the time?
  calibration: { from: number; to: number; examples: number; predicted: number; actual: number }[];
};

export type WinChanceModel = {
  trainedAt: string;
  // Which games these weights came from: "All ranks", or one rank's label
  // ("Gold", "Master+") after modelForTier picks a rank's model.
  rank: string;
  games: number;
  // The patches the training games came from, oldest first.
  patches: string[];
  features: string[];
  // One weight per feature, in WIN_CHANCE_FEATURES order. There's no bias
  // term, so an even game is exactly 50%, and swapping the sides gives the
  // mirror answer.
  weights: number[];
  evaluation: Evaluation;
  // The same check on just the newest patch's games, to spot a patch that
  // changed how much leads are worth. Null when it's the only patch.
  newestPatch: (Evaluation & { patch: string; games: number }) | null;
  // A model of its own for each rank with enough games (see WIN_CHANCE_RANKS).
  ranks: RankModel[];
};

// The ranks that get a model of their own: each tier, plus the two groups
// players filter by most, Emerald+ and Master+. Leads may not be worth the
// same everywhere: lower ranks throw more leads away, so a gold lead may
// count for less there than in Challenger.
export type WinChanceRank = { key: string; label: string; tiers: readonly Tier[] };

export const WIN_CHANCE_RANKS: WinChanceRank[] = [
  ...TIERS.map((tier) => ({ key: tier, label: tierName(tier), tiers: [tier] })),
  { key: "EMERALD+", label: "Emerald+", tiers: TIERS.slice(TIERS.indexOf("EMERALD")) },
  { key: "MASTER+", label: "Master+", tiers: TIERS.slice(TIERS.indexOf("MASTER")) },
];

// A rank needs this many games for a model of its own. With fewer, its
// weights would swing with the luck of which games happened to be collected,
// and the all-ranks model is the better guess.
export const MIN_RANK_GAMES = 800;

export type RankModel = {
  key: string;
  label: string;
  games: number;
  weights: number[];
  // Cross-validated on this rank's games, like the all-ranks model.
  evaluation: Evaluation;
  // The all-ranks model's cross-validated guesses on the same games, so we
  // can see whether a model of its own actually does better.
  allRanks: Evaluation;
};

// How much lower a rank's own log loss on unseen games has to be than the
// all-ranks model's on the same games before the rank's model is used.
// Smaller gaps are within the luck of which games happened to be collected,
// and the all-ranks model learned from far more games.
export const MIN_RANK_GAIN = 0.005;

// Whether a rank's own model clearly beats the all-ranks model on its games.
export function rankModelHelps(rank: RankModel): boolean {
  return rank.evaluation.logLoss <= rank.allRanks.logLoss - MIN_RANK_GAIN;
}

// The model for a game played at `tier` ("GOLD", or null when we don't know
// the rank): that tier's own model, else the narrowest group that includes
// it (Master+ before Emerald+), else the all-ranks model. Only rank models
// that clearly beat the all-ranks model count (rankModelHelps).
export function modelForTier(model: WinChanceModel, tier: string | null): WinChanceModel {
  const tiersOf = (key: string) => WIN_CHANCE_RANKS.find((r) => r.key === key)?.tiers ?? [];
  const fits = model.ranks
    .filter(rankModelHelps)
    .filter((r) => tier !== null && (tiersOf(r.key) as readonly string[]).includes(tier))
    .sort((a, b) => tiersOf(a.key).length - tiersOf(b.key).length);
  return fits.length > 0 ? withRank(model, fits[0]) : model;
}

// The all-ranks model with one rank's weights in place of its own.
export function withRank(model: WinChanceModel, rank: RankModel): WinChanceModel {
  const { label, games, weights, evaluation } = rank;
  return { ...model, rank: label, games, weights, evaluation };
}

// Blue side's chance of winning (0 to 1) at one moment.
export function blueWinChance(weights: readonly number[], features: number[]): number {
  return sigmoid(dot(weights, features));
}

// Blue side's chance of winning at every saved minute of a game. Null when the
// saved model was trained on a different feature list.
export function winChanceCurve(
  game: WinChanceGame,
  model: WinChanceModel,
): { t: number; blue: number }[] | null {
  if (model.features.join() !== featureKeys().join()) return null;
  return game.frames.map((frame) => ({
    t: frame.t,
    blue: frame.t > 0 ? blueWinChance(model.weights, winChanceFeatures(frame)) : 0.5,
  }));
}

// One team's chance of winning at every saved minute, for drawing: 0.5 is
// even. `teamId` is 100 (blue) or 200 (red). Null when the model can't be
// used (see winChanceCurve).
export function teamWinChance(
  game: WinChanceGame,
  model: WinChanceModel,
  teamId: number,
): { minute: number; chance: number }[] | null {
  const curve = winChanceCurve(game, model);
  if (!curve) return null;
  return curve.map((p) => ({ minute: p.t / 60, chance: teamId === 100 ? p.blue : 1 - p.blue }));
}

// A minute where one team's win chance moved a lot, and what happened in it.
export type WinChanceSwing = {
  // When the minute ended, in ms since the start.
  timestamp: number;
  // The team's chance before and after, 0 to 1.
  from: number;
  to: number;
  // What each side got during that minute, like ["Baron", "2 kills"].
  ours: string[];
  theirs: string[];
};

// A one-minute move smaller than this (in chance, so 0.08 is 8 points) is
// normal back and forth and isn't called out.
export const MIN_SWING = 0.08;

// The biggest one-minute moves in a team's win chance, in game order. At
// most `limit`, each at least MIN_SWING.
export function biggestSwings(
  game: WinChanceGame,
  chances: { minute: number; chance: number }[],
  teamId: number,
  limit = 3,
): WinChanceSwing[] {
  const swings: WinChanceSwing[] = [];
  for (let i = 1; i < game.frames.length && i < chances.length; i++) {
    const before = game.frames[i - 1];
    const after = game.frames[i];
    const ours = (f: WinChanceFrame) => readTeam(teamId === 100 ? f.blue : f.red);
    const theirs = (f: WinChanceFrame) => readTeam(teamId === 100 ? f.red : f.blue);
    swings.push({
      timestamp: after.t * 1000,
      from: chances[i - 1].chance,
      to: chances[i].chance,
      ours: whatHappened(ours(before), ours(after)),
      theirs: whatHappened(theirs(before), theirs(after)),
    });
  }
  return swings
    .filter((s) => Math.abs(s.to - s.from) >= MIN_SWING)
    .sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from))
    .slice(0, limit)
    .sort((a, b) => a.timestamp - b.timestamp);
}

// What one team got between two frames, biggest things first:
// ["Baron", "1 inhibitor", "2 towers", "3 kills"].
export function whatHappened(before: TeamState, after: TeamState): string[] {
  const gained = (stat: TeamStat) => Math.max(0, after[stat] - before[stat]);
  const counted = (n: number, one: string, many: string) =>
    n === 0 ? [] : [n === 1 ? `1 ${one}` : `${n} ${many}`];
  return [
    ...(gained("elderBuff") ? ["Elder Dragon"] : []),
    ...(gained("baronBuff") ? ["Baron"] : []),
    ...(gained("atakhans") ? ["Atakhan"] : []),
    ...counted(gained("inhibitors"), "inhibitor", "inhibitors"),
    ...counted(gained("dragons"), "dragon", "dragons"),
    ...(gained("heralds") ? ["Rift Herald"] : []),
    ...counted(gained("grubs"), "void grub", "void grubs"),
    ...counted(gained("towers"), "tower", "towers"),
    ...counted(gained("kills"), "kill", "kills"),
  ];
}

// Training: learns the weights on every example, and checks them with
// cross-validation first. `games` is how many games the examples came from.
// Then does the same for each rank with at least `minRankGames` games.
export function trainWinChanceModel(
  examples: Example[],
  games: number,
  trainedAt: Date,
  { minRankGames = MIN_RANK_GAMES } = {},
): WinChanceModel {
  const patches = [...new Set(examples.map((e) => e.patch))].sort(comparePatches);
  const newest = patches.at(-1);
  const predictions = crossValidate(examples);
  const onNewest = predictions.filter((p) => p.example.patch === newest);

  return {
    trainedAt: trainedAt.toISOString(),
    rank: ALL_RANKS,
    games,
    patches,
    features: featureKeys(),
    weights: fitLogistic(examples),
    evaluation: evaluate(predictions),
    newestPatch:
      newest && patches.length > 1
        ? {
            patch: newest,
            games: new Set(onNewest.map((p) => p.example.matchId)).size,
            ...evaluate(onNewest),
          }
        : null,
    ranks: trainRanks(examples, predictions, minRankGames),
  };
}

export const ALL_RANKS = "All ranks";

// One model per rank, each trained and cross-validated on that rank's games
// only. Ranks with too few games are left out (modelForTier then falls back
// to a group or all ranks).
function trainRanks(examples: Example[], allPredictions: Prediction[], minGames: number): RankModel[] {
  return WIN_CHANCE_RANKS.flatMap((rank) => {
    const inRank = (e: Example) =>
      e.tier !== undefined && (rank.tiers as readonly string[]).includes(e.tier);
    const ours = examples.filter(inRank);
    const games = new Set(ours.map((e) => e.matchId)).size;
    if (games < minGames) return [];
    return [
      {
        key: rank.key,
        label: rank.label,
        games,
        weights: fitLogistic(ours),
        evaluation: evaluate(crossValidate(ours)),
        allRanks: evaluate(allPredictions.filter((p) => inRank(p.example))),
      },
    ];
  });
}

type Prediction = { example: Example; blue: number };

// Predicts every example with weights that never saw its game. The games
// are split into five groups, and each group is predicted by weights
// trained on the other four. All the minutes of one game stay in the same
// group: minute 20 and minute 21 of a game look alike and share a result,
// so splitting them up would let the model peek at the answer.
export function crossValidate(examples: Example[], folds = 5): Prediction[] {
  const ids = [...new Set(examples.map((e) => e.matchId))];
  const fold = new Map(ids.map((id, i) => [id, i % folds]));
  const predictions: Prediction[] = [];
  for (let k = 0; k < folds; k++) {
    const test = examples.filter((e) => fold.get(e.matchId) === k);
    if (test.length === 0) continue;
    const weights = fitLogistic(examples.filter((e) => fold.get(e.matchId) !== k));
    for (const example of test) {
      predictions.push({ example, blue: blueWinChance(weights, example.features) });
    }
  }
  return predictions;
}

export const CHECK_MINUTES = [10, 15, 20, 25, 30];

export function evaluate(predictions: Prediction[]): Evaluation {
  let logLoss = 0;
  let brier = 0;
  for (const { example, blue } of predictions) {
    const won = example.blueWin ? 1 : 0;
    // Clamped so one 100%-sure miss can't make the total infinite.
    const p = Math.min(1 - 1e-6, Math.max(1e-6, blue));
    logLoss -= won * Math.log(p) + (1 - won) * Math.log(1 - p);
    brier += (blue - won) ** 2;
  }
  const n = Math.max(1, predictions.length);

  const goldIndex = WIN_CHANCE_FEATURES.findIndex((f) => f.key === "gold");
  const byMinute = CHECK_MINUTES.map((minute) => {
    // Frames land a few ms after each minute, so match on the rounded minute.
    const at = predictions.filter((p) => Math.round(p.example.minute) === minute);
    return {
      minute,
      examples: at.length,
      accuracy: accuracyOf(at, (p) => p.blue),
      goldRule: accuracyOf(at, (p) => 0.5 + Math.sign(p.example.features[goldIndex]) / 4),
    };
  });

  const calibration = Array.from({ length: 10 }, (_, i) => {
    const from = i / 10;
    const to = (i + 1) / 10;
    // The last group includes exactly 100%.
    const inGroup = predictions.filter((p) => p.blue >= from && (p.blue < to || i === 9));
    return {
      from,
      to,
      examples: inGroup.length,
      predicted: round(average(inGroup.map((p) => p.blue)), 3),
      actual: round(average(inGroup.map((p) => (p.example.blueWin ? 1 : 0))), 3),
    };
  });

  return {
    examples: predictions.length,
    accuracy: accuracyOf(predictions, (p) => p.blue),
    logLoss: round(logLoss / n, 4),
    brier: round(brier / n, 4),
    byMinute,
    calibration,
  };
}

// How often `chance` favoured the team that went on to win. Exactly 50% is
// a coin flip, so it counts as half right.
function accuracyOf(predictions: Prediction[], chance: (p: Prediction) => number): number {
  if (predictions.length === 0) return 0;
  const right = predictions.reduce((total, p) => {
    const c = chance(p);
    return total + (c === 0.5 ? 0.5 : Number(c > 0.5 === p.example.blueWin));
  }, 0);
  return round(right / predictions.length, 3);
}

// Logistic regression by gradient descent, as in the game score (score.ts):
// start with every weight at 0 (50% for everything) and repeatedly nudge
// them so the predicted chances get closer to the real results. A weight
// that goes the wrong way for a feature that `alwaysHelps` is put back to 0.
//
// The features have very different sizes (a gold lead of 3 vs a Baron buff
// of 1), so each is first divided by its typical size, which lets one
// learning rate suit them all. The weights are turned back into plain units
// at the end, so the saved model reads "per 1,000 gold" and "per tower".
export function fitLogistic(
  examples: Example[],
  { steps = 1000, rate = 0.5, l2 = 0.001 } = {},
): number[] {
  const width = WIN_CHANCE_FEATURES.length;
  const weights: number[] = new Array(width).fill(0);
  const n = examples.length;
  if (n === 0) return weights;

  // Root mean square instead of standard deviation: subtracting the mean
  // would add a bias term and break "even game = 50%".
  const scale = WIN_CHANCE_FEATURES.map((_, i) => {
    const size = Math.sqrt(average(examples.map((e) => e.features[i] ** 2)));
    return size > 0 ? size : 1;
  });
  const rows = examples.map((e) => ({
    x: e.features.map((v, i) => v / scale[i]),
    y: e.blueWin ? 1 : 0,
  }));

  for (let step = 0; step < steps; step++) {
    const grad: number[] = new Array(width).fill(0);
    for (const { x, y } of rows) {
      const error = sigmoid(dot(weights, x)) - y;
      for (let i = 0; i < width; i++) grad[i] += error * x[i];
    }
    for (let i = 0; i < width; i++) {
      const next = weights[i] - rate * (grad[i] / n + l2 * weights[i]);
      weights[i] = WIN_CHANCE_FEATURES[i].alwaysHelps ? Math.max(0, next) : next;
    }
  }
  return weights.map((w, i) => round(w / scale[i], 4));
}

export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function featureKeys(): string[] {
  return WIN_CHANCE_FEATURES.map((f) => f.key);
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const average = (xs: number[]) => (xs.length ? sum(xs) / xs.length : 0);
const dot = (a: readonly number[], b: number[]) => a.reduce((total, x, i) => total + x * b[i], 0);
const round = (x: number, digits: number) => Math.round(x * 10 ** digits) / 10 ** digits;

// The "try it yourself" calculator on the How it works page: your team's
// chance from a few leads you pick, using the same features and weights as
// the match page. Each lead is yours minus the enemy's, so 0 is even.
export type WhatIf = {
  minute: number;
  goldLead: number;
  xpLead: number;
  dragonLead: number;
  inhibitorLead: number;
  // 1 while your team has Baron, -1 while the enemy does.
  baron: -1 | 0 | 1;
};

export function whatIfChance(model: Pick<WinChanceModel, "weights">, w: WhatIf): number {
  const zero = readTeam([]);
  // Your team plays blue: a lead goes on your side, a deficit on theirs.
  const you: TeamState = {
    ...zero,
    gold: w.goldLead,
    xp: w.xpLead,
    dragons: Math.max(0, w.dragonLead),
    inhibitors: Math.max(0, w.inhibitorLead),
    baronBuff: Math.max(0, w.baron),
  };
  const them: TeamState = {
    ...zero,
    dragons: Math.max(0, -w.dragonLead),
    inhibitors: Math.max(0, -w.inhibitorLead),
    baronBuff: Math.max(0, -w.baron),
  };
  const features = WIN_CHANCE_FEATURES.map((f) => f.value(you, them, w.minute));
  return blueWinChance(model.weights, features);
}
