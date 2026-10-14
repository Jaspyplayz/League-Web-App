// The match panel's Team analysis tab, like op.gg's: for each stat, both
// teams' totals and how much each player put in. Each team is listed in role
// order, so row 2 is both junglers and you can compare each champion with
// the one they played against.

import type { Participant } from "@/lib/riot/types";

export type TeamStat = {
  key: string;
  label: string;
  // Your team first. `won` decides the color: winners blue, losers amber.
  teams: {
    teamId: number;
    won: boolean;
    total: number;
    players: { participantId: number; championName: string; value: number }[];
  }[];
  // The biggest single player's value, so every bar in the stat shares a scale.
  max: number;
};

const STATS: { key: string; label: string; value: (p: Participant) => number }[] = [
  { key: "kills", label: "Champion kills", value: (p) => p.kills },
  { key: "gold", label: "Gold earned", value: (p) => p.goldEarned },
  { key: "damage", label: "Damage to champions", value: (p) => p.totalDamageDealtToChampions },
  { key: "taken", label: "Damage taken", value: (p) => p.totalDamageTaken },
  { key: "wards", label: "Wards placed", value: (p) => p.wardsPlaced },
  { key: "cs", label: "CS", value: (p) => p.totalMinionsKilled + p.neutralMinionsKilled },
];

// Riot's role names in map order: top, jungle, mid, bot, support.
const ROLE_ORDER = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];

// One team's players in role order. Players without a known role (some game
// modes have none) go last, in the order Riot listed them.
export function byRole<T extends Pick<Participant, "teamPosition">>(players: T[]): T[] {
  const rank = (p: T) => {
    const i = ROLE_ORDER.indexOf(p.teamPosition);
    return i === -1 ? ROLE_ORDER.length : i;
  };
  // sort() keeps equal ranks in their original order.
  return [...players].sort((a, b) => rank(a) - rank(b));
}

// Which team to show first: yours, so you always find yourself on the left
// (or on top). Blue side first when we don't know who "you" are.
export function teamOrder(myTeamId?: number): [number, number] {
  return myTeamId === 200 ? [200, 100] : [100, 200];
}

export function teamAnalysis(participants: Participant[], myTeamId?: number): TeamStat[] {
  return STATS.map(({ key, label, value }) => {
    const teams = teamOrder(myTeamId).map((teamId) => {
      const team = byRole(participants.filter((p) => p.teamId === teamId));
      const players = team.map((p) => ({
        participantId: p.participantId,
        championName: p.championName,
        value: value(p),
      }));
      return {
        teamId,
        won: team[0]?.win ?? false,
        total: players.reduce((sum, p) => sum + p.value, 0),
        players,
      };
    });
    const max = Math.max(1, ...participants.map(value));
    return { key, label, teams, max };
  });
}
