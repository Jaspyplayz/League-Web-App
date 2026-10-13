// The match analyzer: turns one match and its timeline into everything the
// match analysis page shows, from one player's point of view.
//
// Everything in src/lib/analyzer is pure: data in, results out, no network or
// database. That keeps it fast to unit test, and lets stored matches be
// re-analyzed whenever the rules here change, without calling Riot again.

import type { DiffPoint } from "@/lib/diff-chart";
import { gameDurationSeconds } from "../match-summary";
import type { Match, Participant } from "@/lib/riot/types";
import { findDeaths, type Death } from "./deaths";
import {
  diffSeries,
  findOpponent,
  METRICS,
  snapshotAt,
  teamGoldSeries,
  type Metric,
  type Snapshot,
} from "./matchup";
import { findObjectives, type Objective } from "./objectives";
import type { TrimmedTimeline } from "./trim";
import { findTurningPoints, type TurningPoint } from "./turning-points";

// Bump when the analysis changes in a way that should replace saved results.
export const ANALYZER_VERSION = 1;

// Shorter games are remakes or early surrenders: there's too little laning to
// analyze, so the page shows the scoreboard only.
export const MIN_ANALYZED_SECONDS = 15 * 60;

export type MatchAnalysis = {
  me: Participant;
  // Null when no single enemy played the same position.
  opponent: Participant | null;
  // You minus your opponent, per minute, for each stat. Null without an opponent.
  series: Record<Metric, DiffPoint[]> | null;
  at10: Snapshot | null;
  at15: Snapshot | null;
  turningPoints: TurningPoint[];
  deaths: Death[];
  // Your team's gold minus the enemy team's, per minute.
  teamGold: DiffPoint[];
  objectives: Objective[];
};

export function isAnalyzable(match: Match): boolean {
  return gameDurationSeconds(match.info) >= MIN_ANALYZED_SECONDS;
}

export function findPlayer(match: Match, puuid: string): Participant | null {
  return match.info.participants.find((p) => p.puuid === puuid) ?? null;
}

// Finds a player by the Riot ID they had in this game. Riot IDs aren't case
// sensitive. Returns null if nobody matches, e.g. because they renamed since.
export function findPlayerByRiotId(
  match: Match,
  gameName: string,
  tagLine: string,
): Participant | null {
  const same = (a: string | undefined, b: string) => a?.toLowerCase() === b.toLowerCase();
  return (
    match.info.participants.find(
      (p) => same(p.riotIdGameName, gameName) && same(p.riotIdTagline, tagLine),
    ) ?? null
  );
}

// `championLabel` turns Riot's internal champion names ("MonkeyKing") into
// display names ("Wukong") for the sentences. Returns null if the player
// isn't in the match.
export function analyzeMatch(
  match: Match,
  timeline: TrimmedTimeline,
  puuid: string,
  championLabel: (championName: string) => string = (name) => name,
): MatchAnalysis | null {
  const { participants } = match.info;
  const me = findPlayer(match, puuid);
  if (!me) return null;

  const opponent = findOpponent(participants, me);
  const { frames, events } = timeline;
  const byId = new Map(participants.map((p) => [p.participantId, p]));
  const name = (id: number) => {
    const p = byId.get(id);
    return p ? championLabel(p.championName) : "Someone";
  };

  const deaths = findDeaths(events, { me, opponent, participants });

  let series: MatchAnalysis["series"] = null;
  let at10: Snapshot | null = null;
  let at15: Snapshot | null = null;
  let turningPoints: TurningPoint[] = [];
  if (opponent && frames.length >= 2) {
    const meId = me.participantId;
    const oppId = opponent.participantId;
    series = Object.fromEntries(
      METRICS.map((metric) => [metric, diffSeries(frames, meId, oppId, metric)]),
    ) as Record<Metric, DiffPoint[]>;
    at10 = snapshotAt(frames, meId, oppId, 10);
    at15 = snapshotAt(frames, meId, oppId, 15);
    turningPoints = findTurningPoints({
      frames,
      events,
      me,
      opponent,
      participants,
      deaths,
      name,
    });
  }

  return {
    me,
    opponent,
    series,
    at10,
    at15,
    turningPoints,
    deaths,
    teamGold: teamGoldSeries(frames, participants, me.teamId),
    objectives: findObjectives(events, me.teamId),
  };
}
