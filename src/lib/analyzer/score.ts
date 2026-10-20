// Turnpoint's game score: 0 to 100 for every player in a game, our own take
// on op.gg's OP Score.
//
// It comes from a small machine learning model (logistic regression) trained
// on games saved in the database, in two steps:
//
// 1. Learn what wins games. For every player in every saved game, the model
//    sees a handful of stats (KDA, kill participation, damage, objectives...)
//    and whether they won. It learns a weight per stat, so nobody has to guess
//    how much a death is worth compared with a ward.
// 2. Turn that into a score. The weights give each player a rating, and the
//    score is how that rating ranks against every saved player of the same
//    role: 73 means "better than 73% of junglers in our games".
//
// Winners usually score higher, since good stats win games, but a player
// who carried a lost game still scores well (op.gg's ACE).
//
// Everything here is pure (games in, numbers out). scripts/train-score.ts
// runs the training and saves the result in score-model.json.

import { gameDurationSeconds } from "@/lib/match-summary";
import type { Match, Participant } from "@/lib/riot/types";

export const ROLES = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"] as const;
export type Role = (typeof ROLES)[number];

// The only parts of a game the score reads. Small enough that the benchmark
// job can save thousands of them as training data (the score_games table)
// without keeping whole matches, and with no names or PUUIDs in it.
const PLAYER_FIELDS = [
  "participantId",
  "teamId",
  "teamPosition",
  "individualPosition",
  "win",
  "kills",
  "deaths",
  "assists",
  "totalMinionsKilled",
  "neutralMinionsKilled",
  "goldEarned",
  "totalDamageDealtToChampions",
  "totalDamageTaken",
  "damageDealtToObjectives",
  "visionScore",
  "gameEndedInEarlySurrender",
] as const;
export type ScorePlayer = Pick<Participant, (typeof PLAYER_FIELDS)[number]>;
export type ScoreGame = { matchId: string; durationS: number; players: ScorePlayer[] };

export function toScoreGame(match: Match): ScoreGame {
  return {
    matchId: match.metadata.matchId,
    durationS: gameDurationSeconds(match.info),
    players: match.info.participants.map(
      (p) => Object.fromEntries(PLAYER_FIELDS.map((key) => [key, p[key]])) as ScorePlayer,
    ),
  };
}

// What each feature reads from. Totals are divided by the game's length so a
// 20-minute game and a 40-minute game compare fairly.
type Stats = {
  p: ScorePlayer;
  minutes: number;
  teamTotal: (stat: (q: ScorePlayer) => number) => number;
  share: (stat: (q: ScorePlayer) => number) => number;
};

// One stat a model looks at. `higherIsBetter` is the one thing we tell the
// model up front; `good` and `bad` explain a score. The phase ratings
// (phase-score.ts) use the same training with their own list.
export type Feature = { key: string; higherIsBetter: boolean; good: string; bad: string };

// What the model looks at, in order. `higherIsBetter` is the one thing we
// tell it up front: more kills never makes you worse, more deaths never makes
// you better. It learns how much each stat matters. The labels explain a
// score ("Best: strong KDA").
//
// Changing this list means retraining: a saved model trained on a different
// list is ignored (see gameScores).
export const SCORE_FEATURES = [
  {
    key: "kda",
    higherIsBetter: true,
    good: "strong KDA",
    bad: "weak KDA",
    value: (s: Stats) => Math.log1p((s.p.kills + s.p.assists) / Math.max(1, s.p.deaths)),
  },
  {
    key: "deathsPer10",
    higherIsBetter: false,
    good: "few deaths",
    bad: "many deaths",
    value: (s: Stats) => (s.p.deaths / s.minutes) * 10,
  },
  {
    key: "killParticipation",
    higherIsBetter: true,
    good: "high kill participation",
    bad: "low kill participation",
    value: (s: Stats) =>
      (s.p.kills + s.p.assists) /
      Math.max(
        1,
        s.teamTotal((q) => q.kills),
      ),
  },
  {
    key: "damageShare",
    higherIsBetter: true,
    good: "big share of team damage",
    bad: "small share of team damage",
    value: (s: Stats) => s.share((q) => q.totalDamageDealtToChampions),
  },
  {
    key: "damagePerMin",
    higherIsBetter: true,
    good: "high damage",
    bad: "low damage",
    value: (s: Stats) => s.p.totalDamageDealtToChampions / s.minutes,
  },
  {
    key: "damageTakenShare",
    higherIsBetter: true,
    good: "soaked damage for the team",
    bad: "soaked little damage",
    value: (s: Stats) => s.share((q) => q.totalDamageTaken),
  },
  {
    key: "goldShare",
    higherIsBetter: true,
    good: "big share of team gold",
    bad: "small share of team gold",
    value: (s: Stats) => s.share((q) => q.goldEarned),
  },
  {
    key: "csPerMin",
    higherIsBetter: true,
    good: "strong farm",
    bad: "weak farm",
    value: (s: Stats) => cs(s.p) / s.minutes,
  },
  {
    key: "visionPerMin",
    higherIsBetter: true,
    good: "good vision",
    bad: "poor vision",
    value: (s: Stats) => s.p.visionScore / s.minutes,
  },
  {
    key: "objectiveDamagePerMin",
    higherIsBetter: true,
    good: "big objective damage",
    bad: "little objective damage",
    value: (s: Stats) => (s.p.damageDealtToObjectives ?? 0) / s.minutes,
  },
] as const;

// Games shorter than this (remakes, early surrenders) aren't scored or used
// for training: there's too little to judge.
export const MIN_SCORED_SECONDS = 10 * 60;

// A role gets its own weights once it has this many training players. Below
// that, every role shares one set of weights, which is steadier on little data.
export const MIN_ROLE_SAMPLES = 300;

// One player in one game, ready for training.
export type Example = { matchId: string; role: Role; features: number[]; win: boolean };

// Learned weights. `accuracy` is how often they picked the right result in
// games they weren't trained on (cross-validation, see crossValidate).
export type Weights = { weights: number[]; bias: number; samples: number; accuracy: number };

export type RoleModel = {
  samples: number;
  // What's normal for the role, since a support's damage share is low by
  // design: each stat is compared with players of the same role first.
  mean: number[];
  std: number[];
  // The role's own weights, once it has enough games (MIN_ROLE_SAMPLES).
  own: Weights | null;
  // 101 ratings, from the worst saved player of this role (0) to the best
  // (100), used to turn a rating into a score. See percentile.
  cuts: number[];
};

// Weights shared by every role, plus each role's normal numbers, cut points
// and (with enough games) its own weights.
export type RoleModels = { shared: Weights; roles: Record<Role, RoleModel> };

export type ScoreModel = RoleModels & {
  trainedAt: string;
  games: number;
  features: string[];
};

// A rating turned into a score, with what helped and hurt it most.
export type Rating = { score: number; strengths: string[]; weakness: string | null };

export type PlayerScore = {
  participantId: number;
  score: number; // 0 to 100
  // Best player on the winning team (MVP) and on the losing team (ACE), as on op.gg.
  badge: "MVP" | "ACE" | null;
  // What helped the score most, best first, and what held it back most.
  strengths: string[];
  weakness: string | null;
};

// A game can be scored when it's long enough and all ten players have a
// role (so not ARAM or Arena, where nobody has a lane to compare).
export function isScorable(game: ScoreGame): boolean {
  if (game.durationS < MIN_SCORED_SECONDS) return false;
  if (game.players.length !== 10) return false;
  return game.players.every((p) => roleOf(p) !== null && !p.gameEndedInEarlySurrender);
}

// Riot's assigned position, or its guess from where they spent the game, as
// in playedPosition (matchup.ts).
export function roleOf(p: Pick<Participant, "teamPosition" | "individualPosition">): Role | null {
  const position = p.teamPosition || p.individualPosition;
  return (ROLES as readonly string[]).includes(position) ? (position as Role) : null;
}

export function scoreFeatures(game: ScoreGame, p: ScorePlayer): number[] {
  const team = game.players.filter((q) => q.teamId === p.teamId);
  const teamTotal = (stat: (q: ScorePlayer) => number) => sum(team.map(stat));
  const stats: Stats = {
    p,
    minutes: game.durationS / 60,
    teamTotal,
    share: (stat) => stat(p) / Math.max(1, teamTotal(stat)),
  };
  return SCORE_FEATURES.map((f) => f.value(stats));
}

// Turns one game into ten training examples (none if it can't be scored).
export function scoreExamples(game: ScoreGame): Example[] {
  if (!isScorable(game)) return [];
  return game.players.map((p) => ({
    matchId: game.matchId,
    role: roleOf(p)!,
    features: scoreFeatures(game, p),
    win: p.win,
  }));
}

// Scores every player in a game. Null when the game can't be scored or the
// saved model was trained on a different feature list.
export function gameScores(game: ScoreGame, model: ScoreModel): PlayerScore[] | null {
  if (!isScorable(game)) return null;
  if (model.features.join() !== featureKeys().join()) return null;

  const scored = game.players.map((p) => ({
    participantId: p.participantId,
    win: p.win,
    ...rate(scoreFeatures(game, p), roleOf(p)!, model, SCORE_FEATURES),
  }));

  return scored.map(({ win, ...rest }) => {
    const team = scored.filter((s) => s.win === win);
    const best = Math.max(...team.map((s) => s.score));
    // Ties go to whoever comes first, so each team has one badge at most.
    const isBest = team.find((s) => s.score === best)?.participantId === rest.participantId;
    return { ...rest, badge: isBest ? (win ? "MVP" : "ACE") : null };
  });
}

// One player's rating from their stats: compared with their role's normal
// numbers, weighted, then placed among the role's cut points.
export function rate(
  values: number[],
  role: Role,
  model: RoleModels,
  features: readonly Feature[],
): Rating {
  const roleModel = model.roles[role];
  const weights = roleModel.own ?? model.shared;
  const z = standardize(values, roleModel);
  // How much each stat pushed the rating up (positive) or down (negative).
  const pushes = z.map((value, i) => value * weights.weights[i]);
  const rating = weights.bias + sum(pushes);

  const ranked = pushes.map((push, i) => ({ push, i })).sort((a, b) => b.push - a.push);
  const worst = ranked[ranked.length - 1];
  return {
    score: Math.round(percentile(rating, roleModel.cuts)),
    strengths: ranked
      .filter((r) => r.push > 0)
      .slice(0, 2)
      .map((r) => features[r.i].good),
    weakness: worst && worst.push < 0 ? features[worst.i].bad : null,
  };
}

// Training: learns each role's normal numbers, then the weights, then the
// cut points that turn ratings into scores. `games` is how many games the
// examples came from, kept for the record.
export function trainScoreModel(examples: Example[], games: number, trainedAt: Date): ScoreModel {
  return {
    trainedAt: trainedAt.toISOString(),
    games,
    features: featureKeys(),
    ...trainRoleModels(examples, SCORE_FEATURES),
  };
}

// The same training for any list of stats (the phase ratings have their own).
export function trainRoleModels(examples: Example[], features: readonly Feature[]): RoleModels {
  const width = features.length;
  const norms = new Map(
    ROLES.map((role) => [role, normsOf(examples.filter((e) => e.role === role), width)]),
  );
  const rows = examples.map((e) => ({ ...e, z: standardize(e.features, norms.get(e.role)!) }));
  const shared = trainWeights(rows, features);

  const roles = Object.fromEntries(
    ROLES.map((role) => {
      const own = rows.filter((r) => r.role === role);
      const ownWeights = own.length >= MIN_ROLE_SAMPLES ? trainWeights(own, features) : null;
      const w = ownWeights ?? shared;
      const ratings = own.map((r) => w.bias + dot(w.weights, r.z));
      const roleModel: RoleModel = {
        samples: own.length,
        ...norms.get(role)!,
        own: ownWeights,
        cuts: cutPoints(ratings),
      };
      return [role, roleModel];
    }),
  ) as Record<Role, RoleModel>;

  return { shared, roles };
}

// The rating's place among the cut points, 0 to 100. A rating halfway
// between the 40th and 41st cut point is 40.5.
export function percentile(rating: number, cuts: number[]): number {
  if (cuts.length < 2 || rating <= cuts[0]) return 0;
  const last = cuts.length - 1;
  if (rating >= cuts[last]) return 100;
  let i = 0;
  while (cuts[i + 1] <= rating) i++;
  const between = (rating - cuts[i]) / (cuts[i + 1] - cuts[i]);
  return ((i + between) / last) * 100;
}

type Row = { matchId: string; z: number[]; win: boolean };

function trainWeights(rows: Row[], features: readonly Feature[]): Weights {
  return {
    ...fitLogistic(rows, { features }),
    samples: rows.length,
    accuracy: crossValidate(rows, 5, features),
  };
}

// How often weights trained without a game pick the right result in it.
// The games are split into five groups, and each group is predicted by
// weights trained on the other four. Players from the same game always stay
// in the same group, since teammates share a result and would make it look
// too easy.
export function crossValidate(
  rows: Row[],
  folds = 5,
  features: readonly Feature[] = SCORE_FEATURES,
): number {
  const ids = [...new Set(rows.map((r) => r.matchId))];
  const fold = new Map(ids.map((id, i) => [id, i % folds]));
  let correct = 0;
  for (let k = 0; k < folds; k++) {
    const test = rows.filter((r) => fold.get(r.matchId) === k);
    if (test.length === 0) continue;
    const model = fitLogistic(
      rows.filter((r) => fold.get(r.matchId) !== k),
      { features },
    );
    for (const r of test) {
      const winning = model.bias + dot(model.weights, r.z) > 0;
      if (winning === r.win) correct++;
    }
  }
  return round(correct / Math.max(1, rows.length), 3);
}

// Logistic regression by gradient descent: start with every weight at 0 and
// repeatedly nudge them so the predicted chances of winning get closer to
// the real wins and losses. After each nudge a weight that went the wrong
// way (say, deaths helping) is put back to 0. The small L2 penalty stops
// any one weight from growing huge when there are only a few hundred games.
export function fitLogistic(
  rows: Row[],
  {
    steps = 2000,
    rate = 0.5,
    l2 = 0.01,
    features = SCORE_FEATURES,
  }: { steps?: number; rate?: number; l2?: number; features?: readonly Feature[] } = {},
): { weights: number[]; bias: number } {
  const width = features.length;
  const weights: number[] = new Array(width).fill(0);
  let bias = 0;
  const n = rows.length;
  if (n === 0) return { weights, bias };

  for (let step = 0; step < steps; step++) {
    const grad: number[] = new Array(width).fill(0);
    let gradBias = 0;
    for (const r of rows) {
      const error = sigmoid(bias + dot(weights, r.z)) - (r.win ? 1 : 0);
      for (let i = 0; i < width; i++) grad[i] += error * r.z[i];
      gradBias += error;
    }
    for (let i = 0; i < width; i++) {
      const next = weights[i] - rate * (grad[i] / n + l2 * weights[i]);
      weights[i] = features[i].higherIsBetter ? Math.max(0, next) : Math.min(0, next);
    }
    bias -= rate * (gradBias / n);
  }
  return { weights: weights.map((w) => round(w, 4)), bias: round(bias, 4) };
}

export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function featureKeys(): string[] {
  return SCORE_FEATURES.map((f) => f.key);
}

function normsOf(examples: Example[], width: number) {
  const mean = Array.from({ length: width }, (_, i) => average(examples.map((e) => e.features[i])));
  const std = mean.map((m, i) => {
    const spread = Math.sqrt(average(examples.map((e) => (e.features[i] - m) ** 2)));
    // A stat that never varies (or a role with no games yet) would divide by zero.
    return spread > 0 ? spread : 1;
  });
  return { mean: mean.map((m) => round(m, 4)), std: std.map((s) => round(s, 4)) };
}

// How many "typical spreads" above or below normal for the role each stat is.
function standardize(features: number[], norm: { mean: number[]; std: number[] }): number[] {
  return features.map((value, i) => (value - norm.mean[i]) / norm.std[i]);
}

// The 0th, 1st, ..., 100th percentile of the ratings.
function cutPoints(ratings: number[]): number[] {
  if (ratings.length === 0) return [];
  const sorted = [...ratings].sort((a, b) => a - b);
  return Array.from({ length: 101 }, (_, i) =>
    round(sorted[Math.round((i / 100) * (sorted.length - 1))], 4),
  );
}

const cs = (p: ScorePlayer) => p.totalMinionsKilled + p.neutralMinionsKilled;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const average = (xs: number[]) => (xs.length ? sum(xs) / xs.length : 0);
const dot = (a: number[], b: number[]) => a.reduce((total, x, i) => total + x * b[i], 0);
const round = (x: number, digits: number) => Math.round(x * 10 ** digits) / 10 ** digits;
