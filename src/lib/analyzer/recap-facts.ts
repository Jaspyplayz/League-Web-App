// The facts an AI-written match recap is allowed to use (see src/lib/recap.ts).
//
// The language model never sees the raw match. It gets this short list of
// numbers the analyzer already worked out, and is told to write only about
// them. That keeps the recap accurate, keeps each request small (and cheap),
// and means the analysis itself stays in plain, tested code.

import type { Match } from "@/lib/riot/types";
import { formatClock } from "./format";
import type { MatchAnalysis } from "./index";
import type { PlayerScore } from "./score";
import type { WinChanceSwing } from "./win-chance";
import { gameDurationSeconds, positionName } from "../match-summary";

export type RecapFacts = {
  result: "win" | "loss";
  champion: string;
  role: string | null;
  laneOpponent: string | null;
  minutes: number;
  kda: string;
  csPerMin: number;
  visionPerMin: number;
  // The 0 to 100 game score and what moved it most.
  gameScore: { score: number; strengths: string[]; weakness: string | null } | null;
  // You minus your lane opponent. Null without an opponent or a long enough game.
  vsOpponentAt10: { gold: number; cs: number; xp: number } | null;
  vsOpponentAt15: { gold: number; cs: number; xp: number } | null;
  // Your team's biggest one-minute win chance moves, in game order.
  winChanceSwings: {
    time: string;
    fromPercent: number;
    toPercent: number;
    yourTeamTook: string[];
    enemyTeamTook: string[];
  }[];
  // The analyzer's own sentences about the biggest gold swings against your opponent.
  turningPoints: { time: string; title: string; detail: string }[];
  deaths: { total: number; before14: number; byKind: Record<string, number> };
  objectives: { yourTeam: Record<string, number>; enemyTeam: Record<string, number> };
  // Only for junglers.
  jungle: {
    junglerMinions: number;
    // Minutes from 3:00 to 14:00 spent near a lane that was ahead, behind or even.
    minutesNearLaneAhead: number;
    minutesNearLaneBehind: number;
    minutesNearLaneEven: number;
    yourGanks: {
      time: string;
      lane: string;
      outcome: string;
      allies: number;
      enemies: number;
      enemyJunglerThere: boolean;
      // The lane's gold + XP lead for your side just before. Null if unknown.
      laneLead: number | null;
    }[];
    enemyJunglerGanks: number;
  } | null;
};

export function recapFacts(
  match: Match,
  analysis: MatchAnalysis,
  swings: WinChanceSwing[] | null,
  score: PlayerScore | null,
  championLabel: (championName: string) => string,
): RecapFacts {
  const { me, opponent } = analysis;
  const minutes = gameDurationSeconds(match.info) / 60;
  const perMin = (n: number) => round1(minutes > 0 ? n / minutes : 0);
  const gaps = (at: MatchAnalysis["at10"]) =>
    at && {
      gold: at.you.gold - at.opponent.gold,
      cs: at.you.cs - at.opponent.cs,
      xp: at.you.xp - at.opponent.xp,
    };

  return {
    result: me.win ? "win" : "loss",
    champion: championLabel(me.championName),
    role: positionName(me.teamPosition),
    laneOpponent: opponent ? championLabel(opponent.championName) : null,
    minutes: Math.round(minutes),
    kda: `${me.kills}/${me.deaths}/${me.assists}`,
    csPerMin: perMin(me.totalMinionsKilled + me.neutralMinionsKilled),
    visionPerMin: perMin(me.visionScore),
    gameScore: score && {
      score: score.score,
      strengths: score.strengths,
      weakness: score.weakness,
    },
    vsOpponentAt10: gaps(analysis.at10),
    vsOpponentAt15: gaps(analysis.at15),
    winChanceSwings: (swings ?? []).map((s) => ({
      time: formatClock(s.timestamp),
      fromPercent: Math.round(s.from * 100),
      toPercent: Math.round(s.to * 100),
      yourTeamTook: s.ours,
      enemyTeamTook: s.theirs,
    })),
    turningPoints: analysis.turningPoints.map((t) => ({
      time: formatClock(t.timestamp),
      title: t.title,
      detail: t.detail,
    })),
    deaths: {
      total: analysis.deaths.length,
      before14: analysis.deaths.filter((d) => d.early).length,
      byKind: countBy(analysis.deaths.map((d) => d.label)),
    },
    objectives: {
      yourTeam: countObjectives(analysis.objectives.filter((o) => o.ours)),
      enemyTeam: countObjectives(analysis.objectives.filter((o) => !o.ours)),
    },
    jungle:
      analysis.pathing && analysis.ganks
        ? {
            junglerMinions: me.neutralMinionsKilled,
            minutesNearLaneAhead: analysis.pathing.nearAhead,
            minutesNearLaneBehind: analysis.pathing.nearBehind,
            minutesNearLaneEven: analysis.pathing.nearEven,
            yourGanks: analysis.ganks.yours.map((g) => ({
              time: formatClock(g.timestamp),
              lane: g.lane,
              outcome: g.outcome,
              allies: g.ganking,
              enemies: g.defending,
              enemyJunglerThere: g.otherJungler,
              laneLead: g.laneLead === null ? null : Math.round(g.laneLead),
            })),
            enemyJunglerGanks: analysis.ganks.theirs.length,
          }
        : null,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const v of values) counts[v] = (counts[v] ?? 0) + 1;
  return counts;
}

// Towers, dragons and the like, counted by kind ({ tower: 3, dragon: 2 }).
function countObjectives(objectives: MatchAnalysis["objectives"]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const o of objectives) counts[o.kind] = (counts[o.kind] ?? 0) + o.count;
  return counts;
}
