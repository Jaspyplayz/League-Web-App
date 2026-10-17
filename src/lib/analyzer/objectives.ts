// Objectives each team took (dragons, Baron, towers, ...), for the team gold
// chart. Answers "did I lose my matchup but the team won anyway?".

import type { TrimmedEvent } from "./trim";

export type ObjectiveKind =
  | "dragon"
  | "elder"
  | "baron"
  | "herald"
  | "grubs"
  | "atakhan"
  | "tower"
  | "inhibitor";

export const OBJECTIVE_NAMES: Record<ObjectiveKind, { short: string; name: string }> = {
  dragon: { short: "D", name: "Dragon" },
  elder: { short: "E", name: "Elder Dragon" },
  baron: { short: "B", name: "Baron" },
  herald: { short: "H", name: "Rift Herald" },
  grubs: { short: "G", name: "Void Grubs" },
  atakhan: { short: "A", name: "Atakhan" },
  tower: { short: "T", name: "Tower" },
  inhibitor: { short: "I", name: "Inhibitor" },
};

export type Objective = {
  timestamp: number;
  kind: ObjectiveKind;
  // True when your team took it.
  ours: boolean;
  // Void grubs spawn in groups, so kills of a group become one entry.
  count: number;
};

// Grub kills by the same team this close together are one group.
const GRUB_GROUP_MS = 90_000;

export function findObjectives(events: TrimmedEvent[], myTeamId: number): Objective[] {
  const objectives: Objective[] = [];
  for (const e of events) {
    if (e.type === "ELITE_MONSTER_KILL") {
      const kind = monsterKind(e.monsterType, e.monsterSubType);
      if (!kind) continue;
      const ours = e.killerTeamId === myTeamId;
      const last = objectives.at(-1);
      if (
        kind === "grubs" &&
        last?.kind === "grubs" &&
        last.ours === ours &&
        e.timestamp - last.timestamp < GRUB_GROUP_MS
      ) {
        last.count++;
        continue;
      }
      objectives.push({ timestamp: e.timestamp, kind, ours, count: 1 });
    } else if (e.type === "BUILDING_KILL") {
      const kind = e.buildingType === "INHIBITOR_BUILDING" ? "inhibitor" : "tower";
      // teamId is the team that lost the building.
      objectives.push({ timestamp: e.timestamp, kind, ours: e.teamId !== myTeamId, count: 1 });
    }
  }
  return objectives;
}

// The kind of epic monster an ELITE_MONSTER_KILL was, from Riot's names.
// Null for ones that aren't objectives.
export function monsterKind(type: string, subType: string | null): ObjectiveKind | null {
  switch (type) {
    case "DRAGON":
      return subType === "ELDER_DRAGON" ? "elder" : "dragon";
    case "BARON_NASHOR":
      return "baron";
    case "RIFTHERALD":
      return "herald";
    case "HORDE":
      return "grubs";
    case "ATAKHAN":
      return "atakhan";
    default:
      return null;
  }
}
