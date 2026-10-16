import { describe, expect, it } from "vitest";
import type { TrimmedEvent } from "./trim";
import { clock, frames, kill, match, participants } from "./test-fixtures";
import {
  biggestSwings,
  blueWinChance,
  comparePatches,
  crossValidate,
  evaluate,
  fitLogistic,
  patchOf,
  readTeam,
  TEAM_STATS,
  teamWinChance,
  toWinChanceGame,
  trainWinChanceModel,
  WIN_CHANCE_FEATURES,
  winChanceCurve,
  winChanceExamples,
  winChanceFeatures,
  whatHappened,
  whatIfChance,
  type TeamState,
  type WinChanceGame,
  type WinChanceModel,
} from "./win-chance";
import trainedModel from "./win-chance-model.json";

const featureIndex = (key: string) => WIN_CHANCE_FEATURES.findIndex((f) => f.key === key);

function monster(at: string, killerTeamId: number, monsterType: string, monsterSubType: string | null = null): TrimmedEvent {
  return {
    type: "ELITE_MONSTER_KILL",
    timestamp: clock(at),
    killerTeamId,
    monsterType,
    monsterSubType,
    killerId: killerTeamId === 100 ? 2 : 7,
    assistingParticipantIds: [],
  };
}

function building(at: string, lostBy: number, buildingType: string): TrimmedEvent {
  return { type: "BUILDING_KILL", timestamp: clock(at), teamId: lostBy, buildingType, laneType: "MID_LANE" };
}

describe("patchOf and comparePatches", () => {
  it("keeps the first two parts of the game version", () => {
    expect(patchOf("16.20.712.3456")).toBe("16.20");
  });

  it("sorts patches by number, not as text", () => {
    expect(["16.10", "15.24", "16.9"].sort(comparePatches)).toEqual(["15.24", "16.9", "16.10"]);
  });
});

describe("toWinChanceGame", () => {
  // Blue players earn 100 gold more than red players every minute, so blue
  // is 500 gold ahead per minute.
  const timeline = {
    frames: frames(30, (minute, id) => ({ gold: minute * (id <= 5 ? 400 : 300), xp: minute * 100 })),
    events: [
      kill("5:00", 2, 7),
      kill("6:00", 8, 3),
      kill("7:00", 1, 6),
      // A tower kills a red player: still blue's kill.
      kill("7:30", 0, 9),
      building("12:00", 200, "TOWER_BUILDING"),
      building("20:30", 200, "INHIBITOR_BUILDING"),
      monster("8:00", 100, "DRAGON", "FIRE_DRAGON"),
      monster("14:00", 100, "DRAGON", "WATER_DRAGON"),
      monster("19:00", 200, "DRAGON", "AIR_DRAGON"),
      monster("9:00", 200, "HORDE"),
      monster("15:00", 100, "RIFTHERALD"),
      monster("20:00", 100, "BARON_NASHOR"),
      monster("26:00", 200, "DRAGON", "ELDER_DRAGON"),
    ],
  };
  // Blue side wins (participants() has red winning by default).
  const players = participants().map((p) => ({ ...p, win: p.teamId === 100 }));
  const game = toWinChanceGame(match(players), timeline)!;
  const at = (minute: number) => {
    const frame = game.frames.find((f) => f.t === minute * 60)!;
    return { blue: readTeam(frame.blue), red: readTeam(frame.red) };
  };

  it("records the patch, the winner and one frame per minute", () => {
    expect(game.matchId).toBe("NA1_1");
    expect(game.patch).toBe("16.20");
    expect(game.blueWin).toBe(true);
    expect(game.frames).toHaveLength(31);
    expect(game.frames[0].blue).toHaveLength(TEAM_STATS.length);
  });

  it("adds up each team's gold and XP", () => {
    expect(at(10).blue.gold).toBe(20_000);
    expect(at(10).red.gold).toBe(15_000);
    expect(at(10).blue.xp).toBe(5_000);
  });

  it("counts kills by who died, including executions", () => {
    expect(at(10).blue.kills).toBe(3);
    expect(at(10).red.kills).toBe(1);
    expect(at(5).blue.kills).toBe(1); // the 5:00 kill is in the 5:00 frame
  });

  it("counts towers, dragons, grubs and heralds", () => {
    expect(at(15)).toMatchObject({
      blue: { towers: 1, dragons: 2, heralds: 1, grubs: 0 },
      red: { towers: 0, dragons: 0, grubs: 1 },
    });
  });

  it("keeps the Baron buff for 3 minutes", () => {
    expect(at(20).blue.baronBuff).toBe(1);
    expect(at(22).blue.baronBuff).toBe(1);
    expect(at(23).blue.baronBuff).toBe(0);
  });

  it("counts an inhibitor as down until it respawns 5 minutes later", () => {
    expect(at(21).blue.inhibitors).toBe(1);
    expect(at(25).blue.inhibitors).toBe(1);
    expect(at(26).blue.inhibitors).toBe(0);
  });

  it("keeps the Elder buff for 150 seconds and doesn't count Elder as a dragon", () => {
    expect(at(27).red).toMatchObject({ elderBuff: 1, dragons: 1 });
    expect(at(29).red.elderBuff).toBe(0);
  });

  it("skips games the game score skips, like remakes", () => {
    expect(toWinChanceGame(match(players, 240), timeline)).toBeNull();
  });
});

describe("winChanceFeatures", () => {
  const team = (stats: Partial<Record<string, number>>) => TEAM_STATS.map((s) => stats[s] ?? 0);

  it("is blue's lead, so an even game is all zeros", () => {
    const even = winChanceFeatures({ t: 600, blue: team({ gold: 15_000 }), red: team({ gold: 15_000 }) });
    expect(even.every((x) => x === 0)).toBe(true);
  });

  it("measures gold in thousands and scales the late gold lead by game time", () => {
    const features = winChanceFeatures({ t: 15 * 60, blue: team({ gold: 30_000 }), red: team({ gold: 27_000 }) });
    expect(features[featureIndex("gold")]).toBe(3);
    expect(features[featureIndex("goldLate")]).toBe(1.5);
  });

  it("gives dragon soul to the first team to 4 dragons", () => {
    const features = winChanceFeatures({ t: 1500, blue: team({ dragons: 1 }), red: team({ dragons: 4 }) });
    expect(features[featureIndex("soul")]).toBe(-1);
    expect(features[featureIndex("dragons")]).toBe(-3);
  });
});

// Made-up games where blue's gold lead wanders up and down, and the team
// ahead at the end usually (not always) wins.
function fakeGames(count: number, patch = "16.20"): WinChanceGame[] {
  let seed = 7;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  return Array.from({ length: count }, (_, g) => {
    let lead = 0;
    const gameFrames = Array.from({ length: 26 }, (_, minute) => {
      if (minute > 0) lead += (random() - 0.5) * 1600;
      const blue = TEAM_STATS.map((s) => (s === "gold" ? 20_000 + lead : 0));
      const red = TEAM_STATS.map((s) => (s === "gold" ? 20_000 : 0));
      return { t: minute * 60, blue, red };
    });
    const blueWin = lead + (random() - 0.5) * 2000 > 0;
    return { matchId: `${patch}_${g}`, patch, blueWin, frames: gameFrames };
  });
}

describe("fitLogistic", () => {
  const examples = fakeGames(150).flatMap(winChanceExamples);
  const weights = fitLogistic(examples);

  it("learns that a gold lead helps", () => {
    expect(weights[featureIndex("gold")]).toBeGreaterThan(0);
  });

  it("never lets a lead that always helps hurt", () => {
    WIN_CHANCE_FEATURES.forEach((f, i) => {
      if (f.alwaysHelps) expect(weights[i]).toBeGreaterThanOrEqual(0);
    });
  });

  it("says 50% for an even game and mirrors the sides", () => {
    const even = new Array(WIN_CHANCE_FEATURES.length).fill(0);
    expect(blueWinChance(weights, even)).toBe(0.5);
    const ahead = even.map((_, i) => (i === featureIndex("gold") ? 3 : 0));
    const behind = ahead.map((x) => -x);
    expect(blueWinChance(weights, ahead) + blueWinChance(weights, behind)).toBeCloseTo(1);
  });

  it("returns all zeros with nothing to learn from", () => {
    expect(fitLogistic([])).toEqual(new Array(WIN_CHANCE_FEATURES.length).fill(0));
  });
});

describe("winChanceExamples", () => {
  it("skips the loading screen frame", () => {
    const [game] = fakeGames(1);
    const examples = winChanceExamples(game);
    expect(examples).toHaveLength(25);
    expect(examples[0].minute).toBe(1);
  });
});

describe("crossValidate and evaluate", () => {
  const examples = fakeGames(100).flatMap(winChanceExamples);
  const predictions = crossValidate(examples);

  it("predicts every example once", () => {
    expect(predictions).toHaveLength(examples.length);
  });

  it("beats a coin flip on games it didn't see, and gets surer later in the game", () => {
    const result = evaluate(predictions);
    expect(result.accuracy).toBeGreaterThan(0.6);
    expect(result.logLoss).toBeLessThan(0.693);
    expect(result.brier).toBeLessThan(0.25);
    const at = (minute: number) => result.byMinute.find((m) => m.minute === minute)!;
    expect(at(25).accuracy).toBeGreaterThan(at(10).accuracy);
    expect(at(10).examples).toBe(100);
  });

  it("puts every prediction in one calibration group", () => {
    const { calibration } = evaluate(predictions);
    expect(calibration).toHaveLength(10);
    expect(calibration.reduce((total, c) => total + c.examples, 0)).toBe(predictions.length);
  });
});

describe("trainWinChanceModel and winChanceCurve", () => {
  const games = [...fakeGames(60, "16.19"), ...fakeGames(40, "16.20")];
  const model = trainWinChanceModel(games.flatMap(winChanceExamples), games.length, new Date(0));

  it("records the patches and checks the newest one on its own", () => {
    expect(model.patches).toEqual(["16.19", "16.20"]);
    expect(model.newestPatch).toMatchObject({ patch: "16.20", games: 40 });
    expect(model.features).toEqual(WIN_CHANCE_FEATURES.map((f) => f.key));
  });

  it("draws a chance for every minute, starting at 50%", () => {
    const curve = winChanceCurve(games[0], model)!;
    expect(curve).toHaveLength(26);
    expect(curve[0]).toEqual({ t: 0, blue: 0.5 });
    expect(curve.every((p) => p.blue > 0 && p.blue < 1)).toBe(true);
  });

  it("ignores a model trained on a different feature list", () => {
    expect(winChanceCurve(games[0], { ...model, features: ["gold"] })).toBeNull();
  });
});

describe("teamWinChance", () => {
  const games = fakeGames(50);
  const model = trainWinChanceModel(games.flatMap(winChanceExamples), games.length, new Date(0));

  it("gives red side 100% minus blue's chance", () => {
    const blue = teamWinChance(games[0], model, 100)!;
    const red = teamWinChance(games[0], model, 200)!;
    expect(blue[10].minute).toBe(10);
    expect(blue[10].chance + red[10].chance).toBeCloseTo(1);
  });
});

describe("whatHappened", () => {
  const state = (stats: Partial<TeamState>) => readTeam(TEAM_STATS.map((s) => stats[s] ?? 0));

  it("lists what a team gained, biggest things first", () => {
    const before = state({ kills: 3, towers: 1, baronBuff: 0 });
    const after = state({ kills: 5, towers: 2, baronBuff: 1, inhibitors: 1 });
    expect(whatHappened(before, after)).toEqual(["Baron", "1 inhibitor", "1 tower", "2 kills"]);
  });

  it("ignores things that went away, like a buff running out", () => {
    expect(whatHappened(state({ baronBuff: 1, inhibitors: 1 }), state({}))).toEqual([]);
  });
});

describe("biggestSwings", () => {
  const team = (stats: Partial<Record<string, number>>) => TEAM_STATS.map((s) => stats[s] ?? 0);
  const game: WinChanceGame = {
    matchId: "NA1_1",
    patch: "16.20",
    blueWin: false,
    frames: [0, 1, 2, 3, 4].map((m) => ({
      t: m * 60,
      blue: team({ kills: m >= 2 ? 2 : 0 }),
      red: team({ baronBuff: m === 4 ? 1 : 0 }),
    })),
  };
  // Blue's chance: even, a small wobble, up 15 points, flat, then down 30.
  const chances = [0.5, 0.53, 0.68, 0.68, 0.38].map((chance, minute) => ({ minute, chance }));

  it("keeps big moves only, in game order, with what each side took", () => {
    expect(biggestSwings(game, chances, 100)).toEqual([
      { timestamp: 120_000, from: 0.53, to: 0.68, ours: ["2 kills"], theirs: [] },
      { timestamp: 240_000, from: 0.68, to: 0.38, ours: [], theirs: ["Baron"] },
    ]);
  });

  it("keeps the biggest ones when there are more than the limit", () => {
    expect(biggestSwings(game, chances, 100, 1).map((s) => s.timestamp)).toEqual([240_000]);
  });

  it("reads the game from red side's point of view", () => {
    const red = chances.map((c) => ({ ...c, chance: 1 - c.chance }));
    expect(biggestSwings(game, red, 200)[1]).toMatchObject({ ours: ["Baron"], theirs: [] });
  });
});

describe("whatIfChance", () => {
  const model = trainedModel as WinChanceModel;
  const even = { minute: 20, goldLead: 0, xpLead: 0, dragonLead: 0, inhibitorLead: 0, baron: 0 } as const;

  it("says 50% for an even game", () => {
    expect(whatIfChance(model, even)).toBe(0.5);
  });

  it("adds up the weighted leads like the worked example in docs/win-chance.md", () => {
    const w = { ...even, goldLead: 2302, xpLead: 1432, dragonLead: -1 };
    const [gold, goldLate, xp, , , , dragons] = model.weights;
    const score = gold * 2.302 + goldLate * 2.302 * (20 / 30) + xp * 1.432 - dragons;
    expect(whatIfChance(model, w)).toBeCloseTo(1 / (1 + Math.exp(-score)), 10);
  });

  it("gives the mirror answer when the leads flip", () => {
    const ahead = { ...even, goldLead: 3000, dragonLead: 2, baron: 1 } as const;
    const behind = { ...even, goldLead: -3000, dragonLead: -2, baron: -1 } as const;
    expect(whatIfChance(model, ahead) + whatIfChance(model, behind)).toBeCloseTo(1, 10);
  });
});
