// Shrinks a raw match-v5 timeline down to what the analyzer reads, so it can
// be stored in Postgres. A raw timeline is a few hundred KB; most of that is
// event types we never use (wards, skill level-ups, ...) and per-frame stats
// like armor and ability haste.
//
// The trimmed shape is what gets saved in the match_timelines table, so
// changing it means bumping TRIM_VERSION. Rows saved with an older version are
// then refetched from Riot the next time someone opens that match.

import type { MapPosition, Timeline, TimelineEvent } from "@/lib/riot/types";

export const TRIM_VERSION = 1;

// One player at one moment of the game.
export type PlayerFrame = {
  gold: number; // total gold earned so far, spent or not
  xp: number;
  level: number;
  cs: number; // minions + jungle monsters
  damage: number; // total damage dealt to champions so far
  position: MapPosition | null;
};

export type TrimmedFrame = {
  timestamp: number; // ms since the game started
  // players[0] is participantId 1, players[9] is participantId 10.
  players: PlayerFrame[];
};

// The four event types the analyzer uses, with only the fields it reads. The
// names match Riot's so they're easy to look up in the API docs.
export type ChampionKill = {
  type: "CHAMPION_KILL";
  timestamp: number;
  // 0 when no champion got the kill (a tower or minions finished them).
  killerId: number;
  victimId: number;
  assistingParticipantIds: number[];
  position: MapPosition | null;
};

export type EliteMonsterKill = {
  type: "ELITE_MONSTER_KILL";
  timestamp: number;
  killerTeamId: number;
  // "DRAGON", "BARON_NASHOR", "RIFTHERALD", "HORDE" (void grubs), "ATAKHAN"
  monsterType: string;
  // For dragons: "FIRE_DRAGON", "ELDER_DRAGON", ...
  monsterSubType: string | null;
  killerId: number;
  assistingParticipantIds: number[];
};

export type BuildingKill = {
  type: "BUILDING_KILL";
  timestamp: number;
  // The team that LOST the building.
  teamId: number;
  buildingType: string; // "TOWER_BUILDING" or "INHIBITOR_BUILDING"
  laneType: string; // "TOP_LANE", "MID_LANE" or "BOT_LANE"
};

export type TurretPlateDestroyed = {
  type: "TURRET_PLATE_DESTROYED";
  timestamp: number;
  // The team that LOST the plate.
  teamId: number;
  laneType: string;
};

export type TrimmedEvent = ChampionKill | EliteMonsterKill | BuildingKill | TurretPlateDestroyed;

export type TrimmedTimeline = {
  frames: TrimmedFrame[];
  events: TrimmedEvent[];
};

export function trimTimeline(timeline: Timeline): TrimmedTimeline {
  const frames: TrimmedFrame[] = [];
  const events: TrimmedEvent[] = [];

  for (const frame of timeline.info.frames) {
    const players: PlayerFrame[] = [];
    for (let id = 1; id <= 10; id++) {
      const p = frame.participantFrames[String(id)];
      players.push({
        gold: p?.totalGold ?? 0,
        xp: p?.xp ?? 0,
        level: p?.level ?? 1,
        cs: (p?.minionsKilled ?? 0) + (p?.jungleMinionsKilled ?? 0),
        damage: p?.damageStats?.totalDamageDoneToChampions ?? 0,
        position: p?.position ?? null,
      });
    }
    frames.push({ timestamp: frame.timestamp, players });

    for (const event of frame.events) {
      const trimmed = trimEvent(event);
      if (trimmed) events.push(trimmed);
    }
  }

  return { frames, events };
}

// Returns null for event types the analyzer doesn't use.
function trimEvent(e: TimelineEvent): TrimmedEvent | null {
  switch (e.type) {
    case "CHAMPION_KILL":
      return {
        type: e.type,
        timestamp: e.timestamp,
        killerId: num(e.killerId),
        victimId: num(e.victimId),
        assistingParticipantIds: ids(e.assistingParticipantIds),
        position: position(e.position),
      };
    case "ELITE_MONSTER_KILL":
      return {
        type: e.type,
        timestamp: e.timestamp,
        killerTeamId: num(e.killerTeamId),
        monsterType: str(e.monsterType),
        monsterSubType: typeof e.monsterSubType === "string" ? e.monsterSubType : null,
        killerId: num(e.killerId),
        assistingParticipantIds: ids(e.assistingParticipantIds),
      };
    case "BUILDING_KILL":
      return {
        type: e.type,
        timestamp: e.timestamp,
        teamId: num(e.teamId),
        buildingType: str(e.buildingType),
        laneType: str(e.laneType),
      };
    case "TURRET_PLATE_DESTROYED":
      return {
        type: e.type,
        timestamp: e.timestamp,
        teamId: num(e.teamId),
        laneType: str(e.laneType),
      };
    default:
      return null;
  }
}

// Riot's data comes from outside the app, so each field is checked rather
// than trusted to have the right type.
function num(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function ids(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((v): v is number => typeof v === "number") : [];
}

function position(value: unknown): MapPosition | null {
  if (typeof value !== "object" || value === null) return null;
  const { x, y } = value as Record<string, unknown>;
  return typeof x === "number" && typeof y === "number" ? { x, y } : null;
}
