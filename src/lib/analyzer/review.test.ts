import { describe, expect, it } from "vitest";
import type { Play } from "./plays";
import { replayData } from "./replay";
import { keyPlays, momentQuestion, reviewMoments } from "./review";
import type { TempoStretch, TempoTimeline } from "./tempo";
import { clock, frames, kill, participants } from "./test-fixtures";
import type { TrimmedEvent } from "./trim";

// participantId 1-5 are blue side (team 100), 6-10 red side (team 200):
// 3 is blue's Ahri, 2 blue's Vi, 8 red's Syndra, 7 red's Kaisa.
const players = participants();
const BLUE = 100;
const RED = 200;
const AHRI = 3;
const VI = 2;
const SYNDRA = 8;
const names = Object.fromEntries(players.map((p) => [p.participantId, p.championName]));

const monster = (at: string, killerTeamId: number, takers: number[]): TrimmedEvent => ({
  type: "ELITE_MONSTER_KILL",
  timestamp: clock(at),
  killerTeamId,
  monsterType: "DRAGON",
  monsterSubType: "FIRE_DRAGON",
  killerId: takers[0],
  assistingParticipantIds: takers.slice(1),
});

// Kills, in time order: 0 Ahri kills Syndra (Vi helps), 1 Kaisa kills
// Ahri, 2 Vi kills Kaisa. Objectives: 0 your team's Dragon, 1 the enemy's.
const replay = replayData(
  {
    frames: frames(10, (minute) => ({ gold: 500 + 400 * minute })),
    events: [
      kill("4:30", AHRI, SYNDRA, [VI]),
      kill("4:40", 7, AHRI),
      kill("4:41", VI, 7),
      monster("4:50", BLUE, [VI]),
      monster("8:00", RED, [7]),
    ],
  },
  players,
  BLUE,
);

// A play from `from` (m:ss) that moved the chance from 50% by `swing` points.
const play = (
  from: string,
  swing: number,
  mine = true,
  kills: number[] = [],
  objectives: number[] = [],
): Play => ({
  from: clock(from) + 400,
  to: clock(from) + 400,
  kills,
  objectives,
  before: 0.5,
  after: 0.5 + swing / 100,
  mine,
  grade: "Even",
});

describe("keyPlays", () => {
  it("picks the three plays you were in that moved the chance most, in game order", () => {
    const plays = [
      play("2:00", 2),
      play("5:00", -6),
      play("9:00", 9, false),
      play("12:00", 3.5),
      play("15:00", 1.2),
      play("20:00", -4),
    ];
    expect(keyPlays(plays).map((p) => p.from)).toEqual(
      ["5:00", "12:00", "20:00"].map((at) => clock(at) + 400),
    );
  });

  it("leaves out plays that barely moved the chance, even if that's fewer than three", () => {
    expect(keyPlays([play("2:00", 0.4), play("5:00", -0.9), play("8:00", 1)])).toHaveLength(1);
    expect(keyPlays([])).toEqual([]);
  });
});

describe("momentQuestion", () => {
  const ask = (swing: number, kills: number[], objectives: number[] = []) =>
    momentQuestion(play("4:30", swing, true, kills, objectives), replay, AHRI);

  it("asks what you knew when you died in a play that hurt", () => {
    expect(ask(-5, [0, 1])).toMatch(/just before you died/);
  });

  it("asks about the enemy's objective, or the fight, when it hurt without your death", () => {
    expect(ask(-3, [], [1])).toMatch(/enemy team started on it/);
    expect(ask(-2, [2])).toMatch(/before this fight started/);
  });

  it("asks what set it up when it helped", () => {
    expect(ask(6, [0, 2], [0])).toMatch(/turn into the objective/);
    expect(ask(2, [], [0])).toMatch(/safe to take/);
    expect(ask(3, [0])).toMatch(/make it happen again/);
  });

  it("never tells you what you should have done", () => {
    for (const q of [ask(-5, [0, 1]), ask(-3, [], [1]), ask(-2, [2]), ask(6, [0], [0]), ask(3, [0])]) {
      expect(q).not.toMatch(/should/i);
    }
  });
});

describe("reviewMoments", () => {
  const stretch = (from: number, to: number, tone: TempoStretch["tone"]) =>
    ({ from, to, tone }) as TempoStretch;
  const tempo = {
    meId: VI,
    enemyId: 7,
    stretches: [stretch(0, clock("4:00"), "ahead"), stretch(clock("4:00"), clock("10:00"), "behind")],
  } as TempoTimeline;
  const chances = {
    perSecond: [],
    plays: [
      { ...play("3:00", 4, true, [0]), grade: "Excellent" as const },
      { ...play("4:41", -5, true, [1]), grade: "Mistake" as const },
    ],
  };

  it("lays each moment out for the page, with where the replay jumps to", () => {
    const [first, second] = reviewMoments(chances, replay, AHRI, names, null);
    expect(first).toEqual({
      at: clock("3:01"),
      clock: "3:00",
      title: "Ahri killed Syndra",
      before: 0.5,
      after: 0.54,
      swing: 4,
      grade: "Excellent",
      question: "What set this up, and could you make it happen again?",
      tempo: null,
      noteLine: "3:00 Ahri killed Syndra: ",
    });
    expect(second.swing).toBe(-5);
    expect(second.grade).toBe("Mistake");
  });

  it("says who had tempo just before, for junglers", () => {
    const moments = reviewMoments(chances, replay, VI, names, tempo);
    expect(moments.map((m) => m.tempo)).toEqual([
      "You were up tempo just before it.",
      `${names[7]} was up tempo just before it.`,
    ]);
  });
});
