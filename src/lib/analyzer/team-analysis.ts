// The match panel's Team analysis tab, like op.gg's: for each stat, both
// teams' totals and how much each player put in.

import type { Participant } from "@/lib/riot/types";

export type TeamStat = {
  key: string;
  label: string;
  // Blue side first. `won` decides the color: winners blue, losers amber.
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

export function teamAnalysis(participants: Participant[]): TeamStat[] {
  return STATS.map(({ key, label, value }) => {
    const teams = [100, 200].map((teamId) => {
      const team = participants.filter((p) => p.teamId === teamId);
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
