import { describe, expect, it } from "vitest";
import { monsterMarks, replayData, scoreboardAt, type ReplayObjective } from "./replay";
import { respawnSeconds } from "./tempo";
import { clock, frames, kill, participants, SPOTS } from "./test-fixtures";
import type { TrimmedEvent, TrimmedTimeline } from "./trim";

// participantId 1-5 are blue side (team 100), 6-10 red side (team 200).
const players = participants();
const BLUE = 100;
const RED = 200;

const skillPoint = (at: string, participantId: number): TrimmedEvent => ({
  type: "SKILL_LEVEL_UP",
  timestamp: clock(at),
  participantId,
  skillSlot: 1,
});
const monster = (at: string, killerTeamId: number, monsterType: string): TrimmedEvent => ({
  type: "ELITE_MONSTER_KILL",
  timestamp: clock(at),
  killerTeamId,
  monsterType,
  monsterSubType: monsterType === "DRAGON" ? "FIRE_DRAGON" : null,
  killerId: killerTeamId === BLUE ? 2 : 7,
  assistingParticipantIds: [],
});
const tower = (at: string, lostBy: number): TrimmedEvent => ({
  type: "BUILDING_KILL",
  timestamp: clock(at),
  teamId: lostBy,
  buildingType: "TOWER_BUILDING",
  laneType: "MID_LANE",
});

// A 20-minute game: everyone earns 400 gold and 7 CS a minute (plus their
// participantId in gold, to tell them apart) and is level 1 + a level every
// 2 minutes.
const timeline: TrimmedTimeline = {
  frames: frames(20, (minute, id) => ({
    gold: 500 + minute * 400 + id,
    cs: minute * 7,
    level: 1 + Math.floor(minute / 2),
  })),
  events: [
    skillPoint("0:30", 3),
    skillPoint("2:10", 3),
    kill("4:30", 8, 3, [7]),
    monster("6:00", BLUE, "DRAGON"),
    monster("8:10", RED, "HORDE"),
    monster("8:20", RED, "HORDE"),
    monster("8:30", RED, "HORDE"),
    kill("9:00", 3, 8, [2, 4]),
    tower("12:00", RED),
  ],
};

const replay = replayData(timeline, players, BLUE);
const at = (time: string) => scoreboardAt(replay, clock(time));
const player = (time: string, id: number) => at(time).players.find((p) => p.participantId === id)!;
const team = (time: string, teamId: number) => at(time).teams.find((t) => t.teamId === teamId)!;

describe("replayData", () => {
  it("keeps the snapshots, every player, and each kill with when the victim was back", () => {
    expect(replay.end).toBe(clock("20:00"));
    expect(replay.snapshots).toHaveLength(21);
    expect(replay.players.map((p) => p.participantId)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(replay.players[2].skillPoints).toEqual([clock("0:30"), clock("2:10")]);
    // Mid was level 3 at the 4:00 snapshot.
    expect(replay.kills[0]).toEqual({
      timestamp: clock("4:30"),
      killerId: 8,
      victimId: 3,
      assists: [7],
      respawnAt: clock("4:30") + respawnSeconds(3, clock("4:30")) * 1000,
      position: null,
    });
  });

  it("credits a tower to the team that didn't lose it", () => {
    expect(replay.objectives.at(-1)).toEqual({ timestamp: clock("12:00"), kind: "tower", teamId: BLUE });
  });

  it("has no items for a game saved without item sales and used-up items", () => {
    expect(replay.players.every((p) => p.items === null)).toBe(true);
    expect(player("10:00", 3).items).toBeNull();
  });
});

describe("scoreboardAt", () => {
  it("counts kills, deaths and assists from the exact millisecond of each kill", () => {
    expect(player("4:29", 3)).toMatchObject({ kills: 0, deaths: 0, assists: 0 });
    expect(player("4:30", 3)).toMatchObject({ kills: 0, deaths: 1, assists: 0 });
    expect(player("4:30", 7)).toMatchObject({ kills: 0, deaths: 0, assists: 1 });
    expect(player("9:00", 3)).toMatchObject({ kills: 1, deaths: 1, assists: 0 });
    expect(player("9:00", 2)).toMatchObject({ kills: 0, deaths: 0, assists: 1 });
  });

  it("reads gold and CS off a straight line between the snapshots either side", () => {
    // Halfway from 1:00 (900 gold, 7 CS) to 2:00 (1,300 gold, 14 CS), plus
    // participantId 3's 3 gold.
    expect(player("1:30", 3)).toMatchObject({ gold: 1103, cs: 11 });
    expect(player("2:00", 3)).toMatchObject({ gold: 1303, cs: 14 });
    expect(player("20:00", 3)).toMatchObject({ gold: 8503, cs: 140 });
  });

  it("levels up at the skill point, kept between the levels in the snapshots either side", () => {
    // Level 1 until 2:00 in the snapshots; the first point at 0:30 can't
    // make it more than that.
    expect(player("1:00", 3).level).toBe(1);
    // Level 2 from the 2:00 snapshot, and 3 at 4:00, but no third point.
    expect(player("2:30", 3).level).toBe(2);
    expect(player("3:59", 3).level).toBe(2);
    expect(player("4:00", 3).level).toBe(3);
  });

  it("shows when a dead player is back, until they are", () => {
    const back = replay.kills[0].respawnAt;
    expect(player("4:29", 3).respawnAt).toBeNull();
    expect(scoreboardAt(replay, clock("4:30")).players[2].respawnAt).toBe(back);
    expect(scoreboardAt(replay, back - 1).players[2].respawnAt).toBe(back);
    expect(scoreboardAt(replay, back).players[2].respawnAt).toBeNull();
  });

  it("puts the victim, killer and helpers of a kill at its spot on the map", () => {
    const fight = replayData(
      { ...timeline, events: [kill("4:30", 8, 3, [7], SPOTS.midLane)] },
      players,
      BLUE,
    );
    const spot = (id: number) => scoreboardAt(fight, clock("4:30")).players[id - 1].position;
    expect([spot(3), spot(7), spot(8)]).toEqual([SPOTS.midLane, SPOTS.midLane, SPOTS.midLane]);
  });

  it("adds up each team's kills, gold and objectives at that moment", () => {
    expect(team("8:15", BLUE)).toEqual({
      teamId: BLUE,
      kills: 0,
      gold: 5 * (500 + 8.25 * 400) + (1 + 2 + 3 + 4 + 5),
      taken: { dragon: 1 },
    });
    expect(team("8:15", RED)).toMatchObject({ kills: 1, taken: { grubs: 1 } });
    expect(team("12:00", RED)).toMatchObject({ kills: 1, taken: { grubs: 3 } });
    expect(team("12:00", BLUE)).toMatchObject({ kills: 1, taken: { dragon: 1, tower: 1 } });
  });

  it("rebuilds each player's items when the timeline kept item changes", () => {
    const withItems = replayData(
      {
        ...timeline,
        events: [
          ...timeline.events,
          { type: "ITEM_PURCHASED", timestamp: 1_000, participantId: 3, itemId: 1056 },
          { type: "ITEM_PURCHASED", timestamp: 1_500, participantId: 3, itemId: 2003 },
          { type: "ITEM_DESTROYED", timestamp: clock("3:00"), participantId: 3, itemId: 2003 },
        ],
      },
      players,
      BLUE,
    );
    const items = (time: string) => scoreboardAt(withItems, clock(time)).players[2].items;
    expect(items("2:00")?.slots).toEqual([1056, 2003, 0, 0, 0, 0]);
    expect(items("3:00")?.slots).toEqual([1056, 0, 0, 0, 0, 0]);
    // Players with no item events have empty slots, not unknown ones.
    expect(scoreboardAt(withItems, clock("3:00")).players[0].items?.slots).toEqual([0, 0, 0, 0, 0, 0]);
  });
});

describe("monsterMarks", () => {
  it("keeps epic monsters only, with each team's void grubs as one mark", () => {
    const objectives: ReplayObjective[] = [
      { timestamp: clock("6:00"), kind: "dragon", teamId: BLUE },
      { timestamp: clock("8:10"), kind: "grubs", teamId: RED },
      { timestamp: clock("8:20"), kind: "grubs", teamId: RED },
      { timestamp: clock("8:30"), kind: "grubs", teamId: BLUE },
      { timestamp: clock("12:00"), kind: "tower", teamId: BLUE },
    ];
    expect(monsterMarks(objectives).map((m) => `${m.kind} ${m.teamId}`)).toEqual([
      "dragon 100",
      "grubs 200",
      "grubs 100",
    ]);
  });
});
