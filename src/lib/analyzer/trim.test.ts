import { describe, expect, it } from "vitest";
import type { Timeline, TimelineParticipantFrame } from "@/lib/riot/types";
import { trimTimeline } from "./trim";

function participantFrame(id: number): TimelineParticipantFrame {
  return {
    participantId: id,
    totalGold: 500 + id,
    currentGold: 20 * id,
    xp: 100 * id,
    level: 2,
    minionsKilled: 10,
    jungleMinionsKilled: 4,
    position: { x: id, y: id * 2 },
    damageStats: { totalDamageDoneToChampions: 250 },
  };
}

const allPlayers = () =>
  Object.fromEntries(
    Array.from({ length: 10 }, (_, i) => [String(i + 1), participantFrame(i + 1)]),
  );

const timeline: Timeline = {
  metadata: { matchId: "NA1_1" },
  info: {
    frameInterval: 60_000,
    frames: [
      { timestamp: 0, participantFrames: allPlayers(), events: [] },
      {
        timestamp: 60_011,
        participantFrames: allPlayers(),
        events: [
          { type: "WARD_PLACED", timestamp: 30_000, creatorId: 1 },
          {
            type: "CHAMPION_KILL",
            timestamp: 45_000,
            killerId: 8,
            victimId: 3,
            assistingParticipantIds: [7],
            position: { x: 7000, y: 7100 },
            bounty: 300,
          },
          { type: "ITEM_PURCHASED", timestamp: 50_000, participantId: 2, itemId: 1055 },
          { type: "ITEM_SOLD", timestamp: 51_000, participantId: 2, itemId: 1055 },
          {
            type: "SKILL_LEVEL_UP",
            timestamp: 52_000,
            participantId: 4,
            skillSlot: 1,
            levelUpType: "NORMAL",
          },
          {
            type: "SKILL_LEVEL_UP",
            timestamp: 53_000,
            participantId: 4,
            skillSlot: 1,
            levelUpType: "EVOLVE",
          },
          {
            type: "ELITE_MONSTER_KILL",
            timestamp: 55_000,
            killerId: 2,
            killerTeamId: 100,
            monsterType: "DRAGON",
            monsterSubType: "FIRE_DRAGON",
          },
          {
            type: "TURRET_PLATE_DESTROYED",
            timestamp: 58_000,
            teamId: 200,
            laneType: "MID_LANE",
            killerId: 3,
          },
          {
            type: "BUILDING_KILL",
            timestamp: 59_000,
            teamId: 200,
            buildingType: "TOWER_BUILDING",
            laneType: "BOT_LANE",
            towerType: "OUTER_TURRET",
          },
        ],
      },
    ],
  },
};

describe("trimTimeline", () => {
  const trimmed = trimTimeline(timeline);

  it("keeps one entry per player per frame, in participantId order", () => {
    expect(trimmed.frames).toHaveLength(2);
    expect(trimmed.frames[1].timestamp).toBe(60_011);
    expect(trimmed.frames[1].players).toHaveLength(10);
    expect(trimmed.frames[1].players[2]).toEqual({
      gold: 503,
      unspentGold: 60,
      xp: 300,
      level: 2,
      cs: 14,
      damage: 250,
      position: { x: 3, y: 6 },
    });
  });

  it("keeps only the event types the analyzer uses, with only their needed fields", () => {
    expect(trimmed.events).toEqual([
      {
        type: "CHAMPION_KILL",
        timestamp: 45_000,
        killerId: 8,
        victimId: 3,
        assistingParticipantIds: [7],
        position: { x: 7000, y: 7100 },
      },
      { type: "ITEM_PURCHASED", timestamp: 50_000, participantId: 2, itemId: 1055 },
      { type: "SKILL_LEVEL_UP", timestamp: 52_000, participantId: 4, skillSlot: 1 },
      {
        type: "ELITE_MONSTER_KILL",
        timestamp: 55_000,
        killerTeamId: 100,
        monsterType: "DRAGON",
        monsterSubType: "FIRE_DRAGON",
        killerId: 2,
        assistingParticipantIds: [],
      },
      { type: "TURRET_PLATE_DESTROYED", timestamp: 58_000, teamId: 200, laneType: "MID_LANE" },
      {
        type: "BUILDING_KILL",
        timestamp: 59_000,
        teamId: 200,
        buildingType: "TOWER_BUILDING",
        laneType: "BOT_LANE",
      },
    ]);
  });

  it("fills in zeros when a player is missing from a frame", () => {
    const sparse = trimTimeline({
      ...timeline,
      info: { ...timeline.info, frames: [{ timestamp: 0, participantFrames: {}, events: [] }] },
    });
    expect(sparse.frames[0].players[0]).toEqual({
      gold: 0,
      xp: 0,
      level: 1,
      cs: 0,
      damage: 0,
      position: null,
    });
  });
});
