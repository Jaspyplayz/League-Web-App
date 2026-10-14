// Turns Riot's match payload into rows for the matches and
// match_participants tables, and a game summary into a benchmark_games row.
// Pure, so it can be tested without a database.

import type { GameTrend } from "../lib/analyzer/trends";
import { gameDurationSeconds } from "../lib/match-summary";
import type { Region } from "../lib/regions";
import type { Match } from "../lib/riot/types";
import type { Tier } from "../lib/tiers";
import type { benchmarkGames, matches, matchParticipants } from "./schema";

export function matchRow(match: Match): typeof matches.$inferInsert {
  const { info } = match;
  return {
    matchId: match.metadata.matchId,
    platformId: info.platformId,
    queueId: info.queueId,
    gameVersion: info.gameVersion,
    gameStartAt: new Date(info.gameStartTimestamp),
    durationS: gameDurationSeconds(info),
    raw: match,
  };
}

export function participantRows(match: Match): (typeof matchParticipants.$inferInsert)[] {
  return match.info.participants.map((p) => ({
    matchId: match.metadata.matchId,
    puuid: p.puuid,
    participantId: p.participantId,
    teamId: p.teamId,
    championId: p.championId,
    championName: p.championName,
    teamPosition: p.teamPosition,
    win: p.win,
    kills: p.kills,
    deaths: p.deaths,
    assists: p.assists,
    cs: p.totalMinionsKilled + p.neutralMinionsKilled,
    goldEarned: p.goldEarned,
    damageToChampions: p.totalDamageDealtToChampions,
    visionScore: p.visionScore,
    items: [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6],
  }));
}

// Which stats a benchmark row has. Bump it when GameTrend gains a stat, and
// `npm run benchmarks` refetches the games saved with an older version.
// Version 2 added XP at 15, early takedowns, vision and the jungle stats.
export const BENCHMARK_STATS_VERSION = 2;

export function benchmarkRow(
  game: GameTrend,
  puuid: string,
  region: Region,
  tier: Tier,
): typeof benchmarkGames.$inferInsert {
  return {
    matchId: game.matchId,
    puuid,
    region,
    tier,
    gameStartAt: new Date(game.startedAt),
    championName: game.championName,
    position: game.position,
    win: game.win,
    goldAt10: game.goldAt10,
    csAt10: game.csAt10,
    goldAt15: game.goldAt15,
    earlyDeaths: game.earlyDeaths,
    csPerMinEarly: game.csPerMin.early,
    csPerMinMid: game.csPerMin.mid,
    csPerMinLate: game.csPerMin.late,
    xpAt15: game.xpAt15,
    earlyTakedowns: game.earlyTakedowns,
    visionPerMin: game.visionPerMin,
    strongerSide: game.strongerSide,
    enemyHalf: game.enemyHalf,
    gankTakedowns: game.gankTakedowns,
    objectiveShare: game.objectiveShare,
    enemyJungleKills: game.enemyJungleKills,
    scuttles: game.scuttles,
    statsVersion: BENCHMARK_STATS_VERSION,
  };
}
