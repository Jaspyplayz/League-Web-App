import { describe, expect, it } from "vitest";
import {
  formatSwing,
  gradeOf,
  playLines,
  playSwing,
  playTitle,
  replayChances,
  type Play,
} from "./plays";
import { replayData } from "./replay";
import { clock, frames, kill, participants } from "./test-fixtures";
import type { TrimmedEvent, TrimmedTimeline } from "./trim";
import {
  blueWinChance,
  sigmoid,
  TEAM_STATS,
  teamStateAt,
  WIN_CHANCE_FEATURES,
  winChanceFeatures,
} from "./win-chance";

// participantId 1-5 are blue side (team 100), 6-10 red side (team 200):
// 3 is blue's Ahri, 2 blue's Vi, 8 red's Syndra.
const players = participants();
const BLUE = 100;
const RED = 200;
const AHRI = 3;
const VI = 2;
const SYNDRA = 8;
const names = Object.fromEntries(players.map((p) => [p.participantId, p.championName]));

// A model that only looks at the gold lead: blue's chance is
// sigmoid(lead / 1,000), so a 450 gold lead is 61.1%.
const goldOnly = {
  features: WIN_CHANCE_FEATURES.map((f) => f.key),
  weights: WIN_CHANCE_FEATURES.map((f) => (f.key === "gold" ? 1 : 0)),
};

const monster = (at: string, killerTeamId: number, monsterType: string, takers: number[]): TrimmedEvent => ({
  type: "ELITE_MONSTER_KILL",
  timestamp: clock(at),
  killerTeamId,
  monsterType,
  monsterSubType: monsterType === "DRAGON" ? "FIRE_DRAGON" : null,
  killerId: takers[0],
  assistingParticipantIds: takers.slice(1),
});
const tower = (at: string, lostBy: number): TrimmedEvent => ({
  type: "BUILDING_KILL",
  timestamp: clock(at),
  teamId: lostBy,
  buildingType: "TOWER_BUILDING",
  laneType: "MID_LANE",
});

// A 10-minute game where everyone earns 400 gold a minute. At 4:30 Ahri
// kills Syndra with Vi's help, so by the 5:00 snapshot Ahri has earned 300
// more and Vi 150 more.
function game(events: TrimmedEvent[]): TrimmedTimeline {
  return {
    frames: frames(10, (minute, id) => ({
      gold: 500 + 400 * minute + (minute >= 5 ? (id === AHRI ? 300 : id === VI ? 150 : 0) : 0),
    })),
    events: [kill("4:30", AHRI, SYNDRA, [VI]), ...events],
  };
}

function chancesOf(timeline: TrimmedTimeline, meId = AHRI, myTeamId = BLUE) {
  const replay = replayData(timeline, players, myTeamId);
  return { replay, chances: replayChances(timeline, replay, goldOnly, meId)! };
}

describe("replayChances", () => {
  it("reads the model at every second, with a kill's gold arriving at the kill", () => {
    const { chances } = chancesOf(game([]));
    expect(chances.perSecond).toHaveLength(601);
    // Even until the kill, then 450 gold up: 61.1%.
    expect(chances.perSecond[0]).toBe(500);
    expect(chances.perSecond[clock("4:29") / 1000]).toBe(500);
    expect(chances.perSecond[clock("4:30") / 1000]).toBe(611);
    expect(chances.perSecond[clock("9:00") / 1000]).toBe(611);
  });

  it("matches the Win chance graph at every snapshot", () => {
    // A model that reads several numbers, like the real one.
    const weights: Record<string, number> = { gold: 0.4, goldLate: -0.2, xp: 0.1, dragons: 0.26 };
    const model = {
      features: goldOnly.features,
      weights: WIN_CHANCE_FEATURES.map((f) => weights[f.key] ?? 0),
    };
    const timeline: TrimmedTimeline = {
      frames: frames(10, (minute, id) => ({
        gold: 500 + (id <= 5 ? 450 : 400) * minute,
        xp: (id <= 5 ? 380 : 420) * minute,
      })),
      events: [kill("2:30", 9, AHRI), monster("6:10", RED, "DRAGON", [7])],
    };
    const replay = replayData(timeline, players, BLUE);
    const { perSecond } = replayChances(timeline, replay, model, AHRI)!;
    const teamOf = new Map(players.map((p) => [p.participantId, p.teamId]));
    // The graph's numbers come straight from each snapshot.
    for (const frame of timeline.frames.slice(1)) {
      const [blue, red] = [BLUE, RED].map((team) => teamStateAt(frame, timeline.events, teamOf, team));
      const graph = blueWinChance(
        model.weights,
        winChanceFeatures({
          t: frame.timestamp / 1000,
          blue: TEAM_STATS.map((stat) => blue[stat]),
          red: TEAM_STATS.map((stat) => red[stat]),
        }),
      );
      expect(perSecond[frame.timestamp / 1000]).toBe(Math.round(graph * 1000));
    }
  });

  it("grades a play by the chance just after it minus just before", () => {
    const { chances } = chancesOf(game([]));
    expect(chances.plays).toEqual([
      {
        from: clock("4:30"),
        to: clock("4:30"),
        kills: [0],
        objectives: [],
        before: 0.5,
        after: sigmoid(0.45),
        mine: true,
      },
    ]);
    expect(playSwing(chances.plays[0])).toBe(11.1);
  });

  it("is from your team's side: the same kill for red is a drop", () => {
    const { chances } = chancesOf(game([]), SYNDRA, RED);
    expect(chances.perSecond[clock("4:30") / 1000]).toBe(389);
    expect(playSwing(chances.plays[0])).toBe(-11.1);
    // Syndra died in it, so it's hers too.
    expect(chances.plays[0].mine).toBe(true);
  });

  it("makes one play of kills and objectives less than 20 seconds apart", () => {
    const { chances } = chancesOf(
      game([
        kill("4:45", 9, AHRI),
        monster("5:00", BLUE, "DRAGON", [VI]),
        tower("5:30", RED),
        monster("8:00", RED, "BARON_NASHOR", [7, 8]),
      ]),
    );
    expect(chances.plays.map((p) => [p.from, p.to, p.kills, p.objectives])).toEqual([
      [clock("4:30"), clock("5:00"), [0, 1], [0]],
      [clock("5:30"), clock("5:30"), [], [1]],
      [clock("8:00"), clock("8:00"), [], [2]],
    ]);
  });

  it("counts a play as yours when you killed, died, helped or took its epic monster", () => {
    const yours = (events: TrimmedEvent[]) =>
      chancesOf({ ...game([]), events }).chances.plays.map((p) => p.mine);
    expect(yours([kill("4:30", 9, AHRI)])).toEqual([true]);
    expect(yours([kill("4:30", VI, 9, [AHRI])])).toEqual([true]);
    expect(yours([kill("4:30", VI, 9)])).toEqual([false]);
    expect(yours([monster("6:00", BLUE, "DRAGON", [VI, AHRI])])).toEqual([true]);
    expect(yours([monster("6:00", BLUE, "DRAGON", [VI])])).toEqual([false]);
    // Riot doesn't say who took a tower.
    expect(yours([tower("6:00", RED)])).toEqual([false]);
  });

  it("can't be worked out with a model trained on other features", () => {
    const timeline = game([]);
    const replay = replayData(timeline, players, BLUE);
    expect(replayChances(timeline, replay, { ...goldOnly, features: ["gold"] }, AHRI)).toBeNull();
  });
});

describe("gradeOf and formatSwing", () => {
  it("grades by the points the chance moved", () => {
    expect([7.6, 4, 3.9, 1, 0.9, 0, -0.9, -1, -3.9, -4].map(gradeOf)).toEqual([
      "Great",
      "Great",
      "Good",
      "Good",
      "Even",
      "Even",
      "Even",
      "Inaccuracy",
      "Inaccuracy",
      "Mistake",
    ]);
  });

  it("writes the swing with its sign", () => {
    expect([7.6, -2, 0].map(formatSwing)).toEqual(["+7.6%", "−2.0%", "0.0%"]);
  });
});

describe("playTitle and playLines", () => {
  // Every kill and objective of the game in one play, to pick from.
  const timeline = game([
    kill("4:40", 9, AHRI),
    kill("4:41", VI, 7),
    kill("4:42", 0, 6),
    monster("4:50", BLUE, "DRAGON", [VI]),
    monster("4:51", RED, "BARON_NASHOR", [7]),
    tower("4:52", BLUE),
    tower("4:53", BLUE),
  ]);
  const replay = replayData(timeline, players, BLUE);
  const play = (kills: number[], objectives: number[] = []): Play => ({
    from: 0,
    to: 0,
    kills,
    objectives,
    before: 0.5,
    after: 0.5,
    mine: false,
  });
  const title = (kills: number[], objectives: number[] = []) =>
    playTitle(play(kills, objectives), replay, names);

  it("names the killer and victim of a lone kill", () => {
    expect(title([0])).toBe("Ahri killed Syndra");
    expect(title([3])).toBe("Darius died to a tower or minions");
  });

  it("calls several kills a fight, with each team's kills", () => {
    expect(title([0, 2])).toBe("Won a fight 2 for 0");
    expect(title([0, 1])).toBe("Traded 1 for 1");
    expect(title([1])).toBe("Kaisa killed Ahri");
    expect(title([0, 1, 2])).toBe("Won a fight 2 for 1");
  });

  it("says which team took what, biggest first", () => {
    expect(title([], [0])).toBe("Your team took Dragon");
    expect(title([], [1, 2, 3])).toBe("The enemy team took Baron and 2 towers");
    expect(title([0, 2], [0, 1])).toBe(
      "Won a fight 2 for 0, your team took Dragon, the enemy team took Baron",
    );
  });

  it("lists every kill and objective in order, with who helped", () => {
    expect(playLines(play([0, 3], [0, 2]), replay, names)).toEqual([
      "4:30 Ahri killed Syndra (Vi helped)",
      "4:42 Darius died to a tower or minions",
      "4:50 Your team took Dragon",
      "4:52 The enemy team took a tower",
    ]);
  });
});
