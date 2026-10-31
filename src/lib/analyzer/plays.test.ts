import { describe, expect, it } from "vitest";
import {
  formatSwing,
  GRADES,
  gradePlay,
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
// Where kills happen: the middle of the map, and the far ends of top and bot.
const MID = { x: 7400, y: 7400 };
const TOP = { x: 2000, y: 12000 };
const BOT = { x: 12500, y: 2000 };
// Two spots 6,000 apart, each 3,000 from MID.
const WEST = { x: 4400, y: 7400 };
const EAST = { x: 10400, y: 7400 };
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
    events: [kill("4:30", AHRI, SYNDRA, [VI], MID), ...events],
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
        // Even to winning, by 11.1 points.
        grade: "Great",
      },
    ]);
    expect(playSwing(chances.plays[0])).toBe(11.1);
  });

  it("is from your team's side: the same kill for red is a drop", () => {
    const { chances } = chancesOf(game([]), SYNDRA, RED);
    expect(chances.perSecond[clock("4:30") / 1000]).toBe(389);
    expect(playSwing(chances.plays[0])).toBe(-11.1);
    expect(chances.plays[0].grade).toBe("Blunder");
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

describe("gradePlay", () => {
  // Kills, in time order (Kaisa is 7, Darius 6):
  // 0 4:30 Ahri kills Syndra (Vi helps)      } one fight: Ahri and Vi
  // 1 4:32 Kaisa kills Vi (Darius, 9 help)   } against Syndra, Kaisa,
  // 2 4:34 Ahri kills Kaisa                  } Darius and 9, won 3 for 1
  // 3 4:36 Ahri kills Darius                 }
  // 4 4:50 9 kills Ahri (10 helps)
  // 5 4:52 Vi kills 9 (1, 4 and 5 help)
  // 6 6:00 Kaisa kills Vi (Darius, 9 help)  } a trade: Vi against four
  // 7 6:02 10 dies to a tower                }
  // 8 7:00 Darius dies to a tower            } no champion of yours
  // 9 7:02 9 dies to a tower                 }
  // 10 8:00 Ahri kills Darius                } three pickoffs, 15 seconds
  // 11 8:15 Ahri kills Kaisa                 } apart: one play, three
  // 12 8:30 Ahri kills Syndra                } fights
  // 13 10:00 Darius kills 1 top (Kaisa, Syndra help)  } two fights at once:
  // 14 10:01 4 kills 9 bot (5 helps)                  } 1 against 3 top, lost,
  // 15 10:02 5 kills 10 bot (4 helps)                 } and 2 against 2 bot, won
  // 16 12:00 1 kills Darius top           } two fights in turn: 1 alone
  // 17 12:01 9 kills 4 bot (10 helps)     } against Darius, Kaisa and
  // 18 12:02 1 kills Kaisa top            } Syndra top, won 3 for 0, and
  // 19 12:03 1 kills Syndra top           } a lost pickoff bot between
  // 20 13:00 1 kills Darius, 6,000 units  } one chase: 20 and 21 are too
  // 21 13:04 1 kills Kaisa  apart         } far apart, but 22 is near
  // 22 13:06 1 kills Syndra between them  } both, so it joins them
  // 23 14:00 1 kills Darius                } a chase that doubles back: 25
  // 24 14:03 1 kills Kaisa 3,500 east      } is far from 24 but near 23,
  // 25 14:06 1 kills Syndra by 23          } so all three are one fight
  // 26 15:00 1 kills Darius                } 8 seconds apart each: 28 is
  // 27 15:08 1 kills Kaisa                 } 16 seconds after 26 but 8
  // 28 15:16 1 kills Syndra                } after 27, so one fight
  // 29-31 16:00 1 kills Darius, Kaisa and Syndra, each 3,423 from the last
  // 32-34 17:00 1 kills Darius, Kaisa and Syndra, each 4,460 from the last
  // The rest is in the middle of the map.
  const timeline = game([
    kill("4:32", 7, VI, [6, 9], MID),
    kill("4:34", AHRI, 7, [], MID),
    kill("4:36", AHRI, 6, [], MID),
    kill("4:50", 9, AHRI, [10], MID),
    kill("4:52", VI, 9, [1, 4, 5], MID),
    kill("6:00", 7, VI, [6, 9], MID),
    kill("6:02", 0, 10, [], MID),
    kill("7:00", 0, 6, [], MID),
    kill("7:02", 0, 9, [], MID),
    kill("8:00", AHRI, 6, [], MID),
    kill("8:15", AHRI, 7, [], MID),
    kill("8:30", AHRI, SYNDRA, [], MID),
    kill("10:00", 6, 1, [7, SYNDRA], TOP),
    kill("10:01", 4, 9, [5], BOT),
    kill("10:02", 5, 10, [4], BOT),
    kill("12:00", 1, 6, [], TOP),
    kill("12:01", 9, 4, [10], BOT),
    kill("12:02", 1, 7, [], TOP),
    kill("12:03", 1, SYNDRA, [], TOP),
    kill("13:00", 1, 6, [], WEST),
    kill("13:04", 1, 7, [], EAST),
    kill("13:06", 1, SYNDRA, [], MID),
    kill("14:00", 1, 6, [], { x: 2000, y: 12000 }),
    kill("14:03", 1, 7, [], { x: 5500, y: 12000 }),
    kill("14:06", 1, SYNDRA, [], { x: 1500, y: 10000 }),
    kill("15:00", 1, 6, [], MID),
    kill("15:08", 1, 7, [], MID),
    kill("15:16", 1, SYNDRA, [], MID),
    kill("16:00", 1, 6, [], { x: 2000, y: 2000 }),
    kill("16:01", 1, 7, [], { x: 5423, y: 2000 }),
    kill("16:02", 1, SYNDRA, [], { x: 8846, y: 2000 }),
    kill("17:00", 1, 6, [], { x: 2000, y: 5000 }),
    kill("17:01", 1, 7, [], { x: 6460, y: 5000 }),
    kill("17:02", 1, SYNDRA, [], { x: 10920, y: 5000 }),
  ]);
  const replay = replayData(timeline, players, BLUE);
  // A play that moved your team's chance from `before` to `after` (0 to 1).
  const grade = (before: number, after: number, kills: number[] = []) =>
    gradePlay({ kills, before, after }, replay);

  it("lists the grades best first, leaving out Best, Miss and Book", () => {
    expect(GRADES).toEqual([
      "Brilliant",
      "Great",
      "Excellent",
      "Good",
      "Even",
      "Inaccuracy",
      "Mistake",
      "Blunder",
    ]);
  });

  it("grades small moves by the points the chance moved", () => {
    expect([0.539, 0.51, 0.509, 0.491, 0.49, 0.461].map((after) => grade(0.5, after))).toEqual([
      "Good",
      "Good",
      "Even",
      "Even",
      "Inaccuracy",
      "Inaccuracy",
    ]);
  });

  it("calls a gain of 4 points or more Excellent when your team stays in its band", () => {
    expect(grade(0.7, 0.8)).toBe("Excellent");
    expect(grade(0.1, 0.15)).toBe("Excellent");
    expect(grade(0.45, 0.55)).toBe("Excellent");
  });

  it("calls a gain of 8 points or more Great when it moves your team up a band", () => {
    // Losing under 40%, even from 40% to 60%, winning over 60%.
    expect(grade(0.35, 0.45)).toBe("Great");
    expect(grade(0.55, 0.65)).toBe("Great");
    expect(grade(0.3, 0.7)).toBe("Great");
    // A smaller gain that only tips over a line isn't.
    expect(grade(0.38, 0.43)).toBe("Excellent");
    expect(grade(0.58, 0.61)).toBe("Good");
  });

  it("calls a loss of 8 points or more a Blunder when it drops your team down a band", () => {
    // Like the 33:36 fight in KR_8419370694, -34.1 points.
    expect(grade(0.7, 0.359)).toBe("Blunder");
    expect(grade(0.65, 0.55)).toBe("Blunder");
    expect(grade(0.45, 0.35)).toBe("Blunder");
    expect(grade(0.43, 0.38)).toBe("Mistake");
    expect(grade(0.9, 0.82)).toBe("Mistake");
    expect(grade(0.2, 0.1)).toBe("Mistake");
    expect(grade(0.62, 0.59)).toBe("Inaccuracy");
  });

  it("counts 40% and 60% as even, as the page rounds them", () => {
    expect(grade(0.32, 0.4)).toBe("Great");
    // The page shows 40.0%, so it's even, not losing.
    expect(grade(0.39996, 0.481)).toBe("Excellent");
    expect(grade(0.52, 0.6)).toBe("Excellent");
    expect(grade(0.6, 0.68)).toBe("Great");
    expect(grade(0.48, 0.4)).toBe("Mistake");
    expect(grade(0.4, 0.32)).toBe("Blunder");
  });

  it("calls a fight won while outnumbered by 2 or more Brilliant, from 4 points", () => {
    // Ahri and Vi against Syndra, Kaisa, Darius and 9: won 3 for 1.
    expect(grade(0.5, 0.55, [0, 1, 2, 3])).toBe("Brilliant");
    expect(grade(0.55, 0.65, [0, 1, 2, 3])).toBe("Brilliant");
    expect(grade(0.5, 0.53, [0, 1, 2, 3])).toBe("Good");
    expect(grade(0.5, 0.45, [0, 1, 2, 3])).toBe("Mistake");
    // Ahead of Great, even when it also turned the game.
    expect(grade(0.3, 0.5, [0, 1, 2, 3])).toBe("Brilliant");
  });

  it("looks at each fight in a play, split where kills are 10 seconds apart", () => {
    // The 2 against 4 is still Brilliant inside a longer play, though the
    // whole play is 5 against 5.
    expect(grade(0.5, 0.55, [0, 1, 2, 3, 4, 5])).toBe("Brilliant");
    // Three pickoffs in a row are three 1 against 1 fights.
    expect(grade(0.5, 0.58, [10, 11, 12])).toBe("Excellent");
  });

  it("splits kills far apart on the map into separate fights, even seconds apart", () => {
    // Together they'd be 3 against 5, won 2 for 1. Apart, top is lost and
    // bot is an even 2 against 2.
    expect(grade(0.5, 0.55, [13, 14, 15])).toBe("Excellent");
  });

  it("keeps two fights apart when their kills take turns", () => {
    // Top is 1 against 3, won 3 for 0, though a bot kill comes between.
    expect(grade(0.5, 0.55, [16, 17, 18, 19])).toBe("Brilliant");
  });

  it("joins two fights when a kill is near both", () => {
    // One chase, 1 against 3, won 3 for 0.
    expect(grade(0.5, 0.55, [20, 21, 22])).toBe("Brilliant");
    // Without the kill between them, they're two 1 against 1 fights.
    expect(grade(0.5, 0.55, [20, 21])).toBe("Excellent");
  });

  it("joins a kill near any of a fight's kills, not only its last", () => {
    expect(grade(0.5, 0.55, [23, 24, 25])).toBe("Brilliant");
  });

  it("times the gap from a fight's last kill, not its first", () => {
    expect(grade(0.5, 0.55, [26, 27, 28])).toBe("Brilliant");
  });

  it("keeps kills up to 3,423 apart together and splits them from 4,460", () => {
    // The gap the golden games leave between kills in one fight and kills in
    // two (see FIGHT_RANGE): a range outside it fails one of these.
    expect(grade(0.5, 0.55, [29, 30, 31])).toBe("Brilliant");
    expect(grade(0.5, 0.55, [32, 33, 34])).toBe("Excellent");
  });

  it("counts a kill with no position as a fight of its own", () => {
    // Without Kaisa's kill on Vi in the fight, the rest is Ahri and Vi on
    // Syndra, then Ahri alone on Kaisa and Darius: never 2 fewer.
    const noPosition = { ...replay, kills: replay.kills.map((k, i) => (i === 1 ? { ...k, position: null } : k)) };
    expect(gradePlay({ kills: [0, 1, 2, 3], before: 0.5, after: 0.55 }, noPosition)).toBe("Excellent");
  });

  it("doesn't call it Brilliant unless your team won a fight outnumbered by 2", () => {
    // Two of yours on Syndra alone.
    expect(grade(0.5, 0.55, [0])).toBe("Excellent");
    // Two of yours against three of theirs: Syndra, Kaisa and Darius.
    expect(grade(0.5, 0.55, [0, 2, 3])).toBe("Excellent");
    // Five of yours against two of theirs.
    expect(grade(0.5, 0.55, [3, 5])).toBe("Excellent");
    // Two of yours against four of theirs, but lost 0 for 2.
    expect(grade(0.5, 0.55, [1, 4])).toBe("Excellent");
    // Traded 1 for 1, with Vi against four.
    expect(grade(0.5, 0.55, [6, 7])).toBe("Excellent");
    // Two enemies died to a tower: none of your champions was in it.
    expect(grade(0.5, 0.55, [8, 9])).toBe("Excellent");
    // Epic monsters and buildings only.
    expect(grade(0.5, 0.55)).toBe("Excellent");
  });

  it("grades from the red side's chance and kills too", () => {
    const red = replayData(timeline, players, RED);
    const redGrade = (before: number, after: number, kills: number[]) =>
      gradePlay({ kills, before, after }, red);
    // Blue's Brilliant fight is red's Blunder.
    expect(grade(0.35, 0.65, [0, 1, 2, 3])).toBe("Brilliant");
    expect(redGrade(0.65, 0.35, [0, 1, 2, 3])).toBe("Blunder");
    // Red's four on Ahri and Vi aren't outnumbered.
    expect(redGrade(0.35, 0.65, [1, 4])).toBe("Great");
  });
});

describe("formatSwing", () => {
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
    grade: "Even",
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
