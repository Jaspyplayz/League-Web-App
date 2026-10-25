import { describe, expect, it } from "vitest";
import type { Participant } from "@/lib/riot/types";
import {
  checkScoreModel,
  fitLogistic,
  gameScores,
  isScorable,
  percentile,
  ROLES,
  SCORE_FEATURES,
  scoreExamples,
  scoreFeatures,
  toScoreGame,
  trainScoreModel,
  type Role,
  type RoleModel,
  type ScoreGame,
  type ScoreModel,
} from "./score";
import { match, participants } from "./test-fixtures";

const feature = (values: number[], key: string) =>
  values[SCORE_FEATURES.findIndex((f) => f.key === key)];

// A made-up game where every stat is "skill" times a base amount, and the
// team with more total skill wins. `random` picks each player's skill.
function fakeGame(id: number, random: () => number) {
  const players = participants().map((p) => {
    const skill = 0.5 + random();
    return {
      ...p,
      kills: Math.round(6 * skill),
      deaths: Math.round(6 / skill),
      assists: Math.round(8 * skill),
      totalMinionsKilled: Math.round(200 * skill),
      goldEarned: Math.round(11000 * skill),
      totalDamageDealtToChampions: Math.round(20000 * skill),
      totalDamageTaken: Math.round(20000 * skill),
      visionScore: Math.round(25 * skill),
      damageDealtToObjectives: Math.round(8000 * skill),
    };
  });
  const teamSkill = (teamId: number) =>
    players.filter((p) => p.teamId === teamId).reduce((sum, p) => sum + p.kills, 0);
  const blueWins = teamSkill(100) >= teamSkill(200);
  const game = match(players.map((p) => ({ ...p, win: (p.teamId === 100) === blueWins })));
  return { ...toScoreGame(game), matchId: `NA1_${id}` };
}

// Always the same "random" numbers, so the tests never flake.
function seeded(seed: number) {
  let x = seed;
  return () => {
    x = (x * 1103515245 + 12345) % 2 ** 31;
    return x / 2 ** 31;
  };
}

describe("scoreFeatures", () => {
  it("turns end-of-game stats into per-minute numbers and team shares", () => {
    const players = participants();
    players[0] = {
      ...players[0],
      kills: 4,
      deaths: 2,
      assists: 6,
      totalDamageDealtToChampions: 15000,
      damageDealtToObjectives: 9000,
    };
    players[1] = { ...players[1], kills: 6, totalDamageDealtToChampions: 15000 };
    const game = toScoreGame(match(players, 1800));
    const values = scoreFeatures(game, game.players[0]);

    expect(feature(values, "kda")).toBeCloseTo(Math.log1p(5)); // (4 + 6) / 2
    expect(feature(values, "deathsPer10")).toBeCloseTo(2 / 3); // 2 deaths in 30 minutes
    expect(feature(values, "killParticipation")).toBe(1); // 10 of the team's 10 kills
    expect(feature(values, "damageShare")).toBe(0.5);
    expect(feature(values, "damagePerMin")).toBe(500);
    expect(feature(values, "objectiveDamagePerMin")).toBe(300);
  });
});

describe("toScoreGame", () => {
  it("keeps only the numbers the score needs, with no names or PUUIDs", () => {
    const game = toScoreGame(match());
    expect(game.durationS).toBe(1800);
    expect(game.players).toHaveLength(10);
    expect(game.players[0]).not.toHaveProperty("puuid");
    expect(game.players[0]).not.toHaveProperty("riotIdGameName");
    expect(game.players[0].teamPosition).toBe("TOP");
  });
});

describe("isScorable", () => {
  it("scores normal Summoner's Rift games", () => {
    expect(isScorable(toScoreGame(match()))).toBe(true);
  });

  it("skips games too short to judge", () => {
    expect(isScorable(toScoreGame(match(participants(), 9 * 60)))).toBe(false);
  });

  it("skips modes without roles, like ARAM", () => {
    const aram = participants().map((p) => ({ ...p, teamPosition: "", individualPosition: "" }));
    expect(isScorable(toScoreGame(match(aram)))).toBe(false);
  });

  it("skips early surrenders", () => {
    const players: Participant[] = participants().map((p) => ({
      ...p,
      gameEndedInEarlySurrender: true,
    }));
    expect(isScorable(toScoreGame(match(players)))).toBe(false);
  });
});

describe("fitLogistic", () => {
  const rows = Array.from({ length: 40 }, (_, i) => {
    const good = i % 2 === 0;
    // Feature 0 (KDA) goes with winning. Feature 1 (deaths) does too here,
    // which can't be right, so its weight must stay at 0 or below.
    const z = SCORE_FEATURES.map((_, j) => (j < 2 ? (good ? 1 : -1) : 0));
    return { matchId: `m${i}`, z, win: good };
  });

  it("learns a positive weight for a stat that goes with winning", () => {
    const { weights } = fitLogistic(rows);
    expect(weights[0]).toBeGreaterThan(0.5);
  });

  it("never lets a stat count the wrong way round", () => {
    const { weights } = fitLogistic(rows);
    expect(feature(weights, "deathsPer10")).toBeLessThanOrEqual(0);
  });
});

describe("percentile", () => {
  const cuts = Array.from({ length: 101 }, (_, i) => i / 10); // 0, 0.1, ... 10

  it("places a rating between its neighbouring cut points", () => {
    expect(percentile(4.05, cuts)).toBeCloseTo(40.5);
  });

  it("stays between 0 and 100", () => {
    expect(percentile(-5, cuts)).toBe(0);
    expect(percentile(50, cuts)).toBe(100);
  });
});

describe("trainScoreModel and gameScores", () => {
  const random = seeded(7);
  const games = Array.from({ length: 80 }, (_, i) => fakeGame(i, random));
  const model = trainScoreModel(games.flatMap(scoreExamples), games.length, new Date(0));

  it("records what it was trained on and how well it did", () => {
    expect(model.games).toBe(80);
    expect(model.shared.samples).toBe(800);
    // Better than a coin flip. One player is only a fifth of a team, so not much better.
    expect(model.shared.accuracy).toBeGreaterThan(0.5);
    // 160 players per role is under MIN_ROLE_SAMPLES, so roles share weights.
    expect(model.roles.JUNGLE.own).toBeNull();
    expect(model.roles.JUNGLE.cuts).toHaveLength(101);
  });

  it("scores everyone 0 to 100, with one MVP on the winners and one ACE on the losers", () => {
    const scores = gameScores(games[0], model)!;
    expect(scores).toHaveLength(10);
    for (const s of scores) {
      expect(s.score).toBeGreaterThanOrEqual(0);
      expect(s.score).toBeLessThanOrEqual(100);
    }
    const winners = new Set(games[0].players.filter((p) => p.win).map((p) => p.participantId));
    const mvp = scores.filter((s) => s.badge === "MVP");
    const ace = scores.filter((s) => s.badge === "ACE");
    expect(mvp).toHaveLength(1);
    expect(ace).toHaveLength(1);
    expect(winners.has(mvp[0].participantId)).toBe(true);
    expect(winners.has(ace[0].participantId)).toBe(false);
  });

  it("gives better stats a better score", () => {
    const players = participants().map((p) => ({ ...p, kills: 5, deaths: 5, assists: 5 }));
    players[0] = { ...players[0], kills: 12, deaths: 1, assists: 10 };
    players[1] = { ...players[1], kills: 0, deaths: 12, assists: 1 };
    const scores = gameScores(toScoreGame(match(players)), model)!;
    const byId = new Map(scores.map((s) => [s.participantId, s]));
    expect(byId.get(1)!.score).toBeGreaterThan(byId.get(2)!.score);
    expect(byId.get(1)!.strengths).toContain("strong KDA");
  });

  it("ignores a saved model that was trained on different stats", () => {
    expect(gameScores(games[0], { ...model, features: ["kda"] })).toBeNull();
  });

  it("leaves the check on unseen games out of a new model", () => {
    expect(model).not.toHaveProperty("unseen");
  });
});

describe("checkScoreModel", () => {
  // A hand-made model that only looks at KDA. The role's normal KDA is a
  // ratio of 1, so a player above it is expected to win and one below to lose.
  const shared = {
    weights: SCORE_FEATURES.map((f) => (f.key === "kda" ? 1 : 0)),
    bias: 0,
    samples: 0,
    accuracy: 0,
  };
  const role: RoleModel = {
    samples: 0,
    mean: SCORE_FEATURES.map((f) => (f.key === "kda" ? Math.log1p(1) : 0)),
    std: SCORE_FEATURES.map(() => 1),
    own: null,
    cuts: [],
  };
  const model: ScoreModel = {
    trainedAt: new Date(0).toISOString(),
    games: 0,
    features: SCORE_FEATURES.map((f) => f.key),
    shared,
    roles: Object.fromEntries(ROLES.map((r) => [r, role])) as Record<Role, RoleModel>,
  };

  // Red (players 6 to 10) wins, as in participants(). The players in
  // `strong` get a KDA ratio of 3, everyone else 1/3.
  function game(matchId: string, strong: number[], durationS = 1800): ScoreGame {
    const players = participants().map((p) =>
      strong.includes(p.participantId)
        ? { ...p, kills: 3, deaths: 1 }
        : { ...p, kills: 1, deaths: 3 },
    );
    return { ...toScoreGame(match(players, durationS)), matchId };
  }

  it("counts how often a player's rating points to their real result", () => {
    const games = [
      game("A", [6, 7, 8, 9, 10]), // all 10 right
      game("B", [6, 7, 8]), // winners 9 and 10 look like losers: 8 right
      game("C", [1, 2, 3, 4, 5], 9 * 60), // too short to score, so left out
    ];
    expect(checkScoreModel(model, games, new Date(0))).toEqual({
      games: 2,
      accuracy: 0.9, // 18 of 20 players
      checkedAt: "1970-01-01T00:00:00.000Z",
    });
  });

  it("uses a role's own weights where the site would", () => {
    // Supports' own weights expect every support to lose: right for blue's,
    // wrong for red's.
    const support = { ...role, own: { ...shared, bias: -10 } };
    const withOwn = { ...model, roles: { ...model.roles, UTILITY: support } };
    expect(checkScoreModel(withOwn, [game("A", [6, 7, 8, 9, 10])], new Date(0)).accuracy).toBe(0.9);
  });

  it("refuses a model the site would ignore", () => {
    expect(() => checkScoreModel(model, [], new Date(0))).not.toThrow();
    expect(() => checkScoreModel({ ...model, features: ["kda"] }, [], new Date(0))).toThrow();
  });
});
