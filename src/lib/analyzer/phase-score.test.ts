import { describe, expect, it } from "vitest";
import type { Participant } from "@/lib/riot/types";
import {
  PHASE_FEATURES,
  PHASES,
  phaseFeatures,
  phaseRatings,
  phaseWindow,
  toPhaseGame,
  trainPhaseModel,
  type PhaseGame,
} from "./phase-score";
import { clock, frames, kill, match, participants } from "./test-fixtures";
import type { TrimmedEvent } from "./trim";

const [EARLY, MID, LATE] = PHASES;
const feature = (values: number[], key: string) =>
  values[PHASE_FEATURES.findIndex((f) => f.key === key)];

// A game of `minutes` minutes where everyone earns 400 gold a minute, plus
// `extraGold` a minute for blue mid (participant 3).
function game(minutes: number, events: TrimmedEvent[] = [], extraGold = 0): PhaseGame {
  const timeline = {
    frames: frames(minutes, (minute, id) => ({
      gold: minute * (400 + (id === 3 ? extraGold : 0)),
      cs: minute * 7,
    })),
    events,
  };
  return toPhaseGame(match(participants(), minutes * 60), timeline)!;
}

describe("phaseWindow", () => {
  it("rates all three phases in a 30-minute game", () => {
    const g = game(30);
    expect(PHASES.map((p) => phaseWindow(g.timeline, p)?.minutes)).toEqual([14, 11, 5]);
  });

  it("leaves out a late game shorter than 5 minutes", () => {
    const g = game(27);
    expect(phaseWindow(g.timeline, LATE)).toBeNull();
    expect(phaseWindow(g.timeline, MID)?.minutes).toBe(11);
  });

  it("leaves out the mid game when the game ends before 19 minutes", () => {
    const g = game(18);
    expect(phaseWindow(g.timeline, MID)).toBeNull();
    expect(phaseWindow(g.timeline, EARLY)?.minutes).toBe(14);
  });
});

describe("toPhaseGame", () => {
  it("skips early surrenders", () => {
    const players: Participant[] = participants().map((p) => ({
      ...p,
      gameEndedInEarlySurrender: true,
    }));
    expect(toPhaseGame(match(players), { frames: frames(30), events: [] })).toBeNull();
  });

  it("skips games where a team is missing a role", () => {
    const players = participants().map((p) =>
      p.participantId === 1 ? { ...p, teamPosition: "", individualPosition: "Invalid" } : p,
    );
    expect(toPhaseGame(match(players), { frames: frames(30), events: [] })).toBeNull();
  });
});

describe("phaseFeatures", () => {
  it("counts only the kills inside the phase", () => {
    const g = game(30, [kill("5:00", 3, 8), kill("20:00", 3, 8), kill("21:00", 8, 3, [7])]);
    const early = phaseFeatures(g, EARLY)!;
    const mid = phaseFeatures(g, MID)!;
    expect(feature(early.get(3)!, "deathsPer10")).toBe(0);
    expect(feature(mid.get(3)!, "deathsPer10")).toBeCloseTo(10 / 11);
    expect(feature(mid.get(8)!, "killParticipation")).toBe(1);
  });

  it("measures gold gained on the lane opponent per minute", () => {
    const g = game(30, [], 50);
    expect(feature(phaseFeatures(g, EARLY)!.get(3)!, "goldLeadPerMin")).toBeCloseTo(50);
    expect(feature(phaseFeatures(g, EARLY)!.get(8)!, "goldLeadPerMin")).toBeCloseTo(-50);
  });

  it("gives the share of the team's epic monsters a player was in on", () => {
    const dragon = (at: string, killerId: number, assists: number[]): TrimmedEvent => ({
      type: "ELITE_MONSTER_KILL",
      timestamp: clock(at),
      killerTeamId: 100,
      monsterType: "DRAGON",
      monsterSubType: "FIRE_DRAGON",
      killerId,
      assistingParticipantIds: assists,
    });
    const g = game(30, [dragon("6:00", 2, [4, 5]), dragon("12:00", 2, [])]);
    const early = phaseFeatures(g, EARLY)!;
    expect(feature(early.get(2)!, "epicShare")).toBe(1);
    expect(feature(early.get(4)!, "epicShare")).toBe(0.5);
    expect(feature(early.get(1)!, "epicShare")).toBe(0);
  });
});

describe("phaseRatings", () => {
  // Half the games blue wins after blue mid farms harder early; in the other
  // half red does.
  const games = Array.from({ length: 40 }, (_, i) => {
    const blueWins = i % 2 === 0;
    const players = participants().map((p) => ({ ...p, win: (p.teamId === 100) === blueWins }));
    const timeline = {
      frames: frames(32, (minute, id) => ({
        gold: minute * (400 + (id === 3 ? (blueWins ? 60 : -60) + (i % 7) : 0)),
        cs: minute * 7,
      })),
      events: [],
    };
    return toPhaseGame({ ...match(players, 32 * 60), metadata: { matchId: `m${i}` } }, timeline)!;
  });
  const model = trainPhaseModel(games, new Date("2026-10-20"));

  it("trains a model for every phase", () => {
    expect(Object.keys(model.phases)).toEqual(["early", "mid", "late"]);
  });

  it("rates a mid laner who out-earned their opponent above one who fell behind", () => {
    const ahead = phaseRatings(games[0], 3, model);
    const behind = phaseRatings(games[1], 3, model);
    expect(ahead.map((r) => r.phase)).toEqual(["early", "mid", "late"]);
    expect(ahead[0].score).toBeGreaterThan(behind[0].score);
    expect(ahead[0].strengths.length).toBeGreaterThan(0);
  });

  it("shows when each phase started and ended", () => {
    const [early, mid, late] = phaseRatings(games[0], 3, model);
    expect([early.fromMinute, early.toMinute]).toEqual([0, 14]);
    expect([mid.fromMinute, mid.toMinute]).toEqual([14, 25]);
    expect([late.fromMinute, late.toMinute]).toEqual([25, 32]);
  });

  it("rates nothing with a model trained on different stats", () => {
    expect(phaseRatings(games[0], 3, { ...model, features: ["kda"] })).toEqual([]);
  });
});
