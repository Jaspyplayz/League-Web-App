// The replay (beta): every player's level, kills, deaths, assists, CS, gold,
// items and spot on the map at any second of the game, and each team's
// totals, for the map and scoreboard under the match page's timeline.
//
// Riot logs kills, deaths, skill points and item changes to the
// millisecond, so those are exact. Gold, CS and positions are only
// snapshotted once a minute, so between two snapshots they're estimates:
// gold and CS read off a straight line from one to the next, positions from
// the path in positions.ts. Respawn times come from the game's death timer
// formula (respawnSeconds in tempo.ts).
//
// replayData runs on the server and keeps only what the map and scoreboard
// need, so the page sends a few dozen KB rather than the whole timeline.
// scoreboardAt runs in the browser each time the clock moves.

import type { MapPosition, Participant } from "@/lib/riot/types";
import {
  finalItems,
  inventoryAt,
  itemHistory,
  keepsItemChanges,
  type FinalItems,
  type Inventory,
  type ItemChange,
} from "./items";
import { monsterKind, type ObjectiveKind } from "./objectives";
import { positionAt, positionPath, type PathPoint } from "./positions";
import { deathSpans } from "./tempo";
import type { TrimmedTimeline } from "./trim";

export type ReplayPlayer = {
  participantId: number;
  teamId: number;
  // Total gold, CS and level at each of Riot's snapshots, in the order of
  // ReplayData.snapshots.
  gold: number[];
  cs: number[];
  level: number[];
  // When each skill point was spent. Every level gives one.
  skillPoints: number[];
  // Their items after each change. Null when the game was saved before
  // Turnpoint kept item sales and used-up items.
  items: ItemChange[] | null;
  // Where they were through the game (positions.ts).
  path: PathPoint[];
};

export type ReplayKill = {
  timestamp: number;
  // 0 when no champion got the kill (a tower or minions finished them).
  killerId: number;
  victimId: number;
  assists: number[];
  // When the victim was back on the map.
  respawnAt: number;
};

// An epic monster, tower or inhibitor, and the team that took it.
export type ReplayObjective = { timestamp: number; kind: ObjectiveKind; teamId: number };

export type ReplayData = {
  myTeamId: number;
  end: number; // ms, the end of the game
  // When each of Riot's once-a-minute snapshots was taken.
  snapshots: number[];
  players: ReplayPlayer[];
  kills: ReplayKill[];
  objectives: ReplayObjective[];
};

export type PlayerMoment = {
  participantId: number;
  level: number;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  gold: number;
  // Null for games saved before items could be rebuilt.
  items: Inventory | null;
  // While they're dead, when they'll be back. Null while alive.
  respawnAt: number | null;
  // Their spot on the map: exact at Riot's snapshots, deaths and visits to
  // the fountain, estimated in between.
  position: MapPosition;
};

export type TeamMoment = {
  teamId: number;
  kills: number;
  gold: number;
  // How many of each epic monster, tower and inhibitor the team had taken.
  taken: Partial<Record<ObjectiveKind, number>>;
};

export type Scoreboard = { players: PlayerMoment[]; teams: TeamMoment[] };

// The final items say which trinket a player kept all game and which
// support upgrade they picked, and the champion whether it's Viego (see
// itemHistory).
type Player = Pick<Participant, "participantId" | "teamId" | "championName"> & FinalItems;

// Everything scoreboardAt needs, from the timeline. `myTeamId` is the team
// of the player whose page it is.
export function replayData(
  timeline: TrimmedTimeline,
  players: Player[],
  myTeamId: number,
): ReplayData {
  const { frames, events } = timeline;
  const exactItems = keepsItemChanges(timeline);
  // One per champion kill, in the same order as the events.
  const respawns = deathSpans(timeline);

  const kills: ReplayKill[] = [];
  const objectives: ReplayObjective[] = [];
  for (const e of events) {
    if (e.type === "CHAMPION_KILL") {
      kills.push({
        timestamp: e.timestamp,
        killerId: e.killerId,
        victimId: e.victimId,
        assists: e.assistingParticipantIds,
        respawnAt: respawns[kills.length].respawnAt,
      });
    } else if (e.type === "ELITE_MONSTER_KILL") {
      const kind = monsterKind(e.monsterType, e.monsterSubType);
      if (kind) objectives.push({ timestamp: e.timestamp, kind, teamId: e.killerTeamId });
    } else if (e.type === "BUILDING_KILL") {
      // teamId is the team that lost the building, so the other one took it.
      const takenBy = players.find((p) => p.teamId !== e.teamId)?.teamId ?? 0;
      const kind = e.buildingType === "INHIBITOR_BUILDING" ? "inhibitor" : "tower";
      objectives.push({ timestamp: e.timestamp, kind, teamId: takenBy });
    }
  }

  return {
    myTeamId,
    end: frames.at(-1)?.timestamp ?? 0,
    snapshots: frames.map((f) => f.timestamp),
    players: players.map((p) => ({
      participantId: p.participantId,
      teamId: p.teamId,
      gold: frames.map((f) => f.players[p.participantId - 1].gold),
      cs: frames.map((f) => f.players[p.participantId - 1].cs),
      level: frames.map((f) => f.players[p.participantId - 1].level),
      skillPoints: events
        .filter((e) => e.type === "SKILL_LEVEL_UP" && e.participantId === p.participantId)
        .map((e) => e.timestamp),
      items: exactItems
        ? itemHistory(events, p.participantId, {
            finalItems: finalItems(p),
            champion: p.championName,
          })
        : null,
      path: positionPath(timeline, p, respawns),
    })),
    kills,
    objectives,
  };
}

// The scoreboard at moment t (ms).
export function scoreboardAt(data: ReplayData, t: number): Scoreboard {
  const { snapshots } = data;
  // The snapshot at or before t, and the one after it.
  const i = Math.max(0, snapshots.findLastIndex((s) => s <= t));

  const players = data.players.map((p): PlayerMoment => {
    const scores = { kills: 0, deaths: 0, assists: 0 };
    let respawnAt: number | null = null;
    for (const k of data.kills) {
      if (k.timestamp > t) break;
      if (k.killerId === p.participantId) scores.kills++;
      if (k.assists.includes(p.participantId)) scores.assists++;
      if (k.victimId === p.participantId) {
        scores.deaths++;
        respawnAt = t < k.respawnAt ? k.respawnAt : null;
      }
    }
    // Like the tempo timeline: each level gives one skill point, but points
    // can be spent a little late, so the count is kept between the levels in
    // the snapshots either side.
    const lowest = p.level[i];
    const highest = p.level[i + 1] ?? lowest;
    const points = p.skillPoints.filter((at) => at <= t).length;
    return {
      participantId: p.participantId,
      level: Math.min(highest, Math.max(lowest, points)),
      ...scores,
      cs: Math.round(between(p.cs, snapshots, t)),
      gold: Math.round(between(p.gold, snapshots, t)),
      items: p.items ? inventoryAt(p.items, t) : null,
      respawnAt,
      position: positionAt(p.path, t),
    };
  });

  const teamIds = [...new Set(data.players.map((p) => p.teamId))];
  const teams = teamIds.map((teamId): TeamMoment => {
    const members = data.players
      .filter((p) => p.teamId === teamId)
      .map((p) => players.find((m) => m.participantId === p.participantId)!);
    const taken: TeamMoment["taken"] = {};
    for (const o of data.objectives) {
      if (o.timestamp <= t && o.teamId === teamId) taken[o.kind] = (taken[o.kind] ?? 0) + 1;
    }
    return {
      teamId,
      kills: members.reduce((sum, m) => sum + m.kills, 0),
      gold: members.reduce((sum, m) => sum + m.gold, 0),
      taken,
    };
  });

  return { players, teams };
}

// The epic monsters for the timeline's marks. Void grubs come three at a
// time, so a team's grubs within GRUB_GROUP_MS of its first one are one mark.
const GRUB_GROUP_MS = 90_000;
const EPIC_MONSTERS = new Set<ObjectiveKind>(["dragon", "elder", "baron", "herald", "grubs", "atakhan"]);

export function monsterMarks(objectives: ReplayObjective[]): ReplayObjective[] {
  const marks: ReplayObjective[] = [];
  for (const o of objectives) {
    if (!EPIC_MONSTERS.has(o.kind)) continue;
    const sameGroup = marks.some(
      (m) =>
        o.kind === "grubs" &&
        m.kind === "grubs" &&
        m.teamId === o.teamId &&
        o.timestamp - m.timestamp < GRUB_GROUP_MS,
    );
    if (!sameGroup) marks.push(o);
  }
  return marks;
}

// A once-a-minute number at moment t, on a straight line between the
// snapshots either side of it.
function between(values: number[], snapshots: number[], t: number): number {
  const after = snapshots.findIndex((s) => s >= t);
  if (after === -1) return values.at(-1) ?? 0;
  if (after === 0) return values[0];
  const from = snapshots[after - 1];
  const share = (t - from) / (snapshots[after] - from);
  return values[after - 1] + (values[after] - values[after - 1]) * share;
}
