import { describe, expect, it } from "vitest";
import { findObjectives } from "./objectives";
import type { TrimmedEvent } from "./trim";

const monster = (
  timestamp: number,
  killerTeamId: number,
  monsterType: string,
  monsterSubType: string | null = null,
): TrimmedEvent => ({
  type: "ELITE_MONSTER_KILL",
  timestamp,
  killerTeamId,
  monsterType,
  monsterSubType,
  killerId: 0,
  assistingParticipantIds: [],
});

describe("findObjectives", () => {
  it("marks which side took each objective", () => {
    const events: TrimmedEvent[] = [
      monster(400_000, 100, "DRAGON", "FIRE_DRAGON"),
      monster(900_000, 200, "RIFTHERALD"),
      // teamId on buildings is the team that lost it.
      {
        type: "BUILDING_KILL",
        timestamp: 1_000_000,
        teamId: 200,
        buildingType: "TOWER_BUILDING",
        laneType: "MID_LANE",
      },
      {
        type: "BUILDING_KILL",
        timestamp: 1_500_000,
        teamId: 100,
        buildingType: "INHIBITOR_BUILDING",
        laneType: "BOT_LANE",
      },
      monster(2_100_000, 200, "DRAGON", "ELDER_DRAGON"),
      monster(1_600_000, 200, "BARON_NASHOR"),
    ];
    expect(findObjectives(events, 100).map((o) => [o.kind, o.ours])).toEqual([
      ["dragon", true],
      ["herald", false],
      ["tower", true],
      ["inhibitor", false],
      ["elder", false],
      ["baron", false],
    ]);
  });

  it("groups void grubs killed together", () => {
    const events = [
      monster(360_000, 100, "HORDE"),
      monster(365_000, 100, "HORDE"),
      monster(371_000, 100, "HORDE"),
      monster(560_000, 200, "HORDE"),
    ];
    expect(findObjectives(events, 100)).toEqual([
      { timestamp: 360_000, kind: "grubs", ours: true, count: 3 },
      { timestamp: 560_000, kind: "grubs", ours: false, count: 1 },
    ]);
  });

  it("skips monsters it doesn't know", () => {
    expect(findObjectives([monster(100, 100, "SOMETHING_NEW")], 100)).toEqual([]);
  });
});
