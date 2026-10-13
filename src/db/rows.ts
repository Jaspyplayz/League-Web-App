// Turns Riot's match payload into rows for the matches and
// match_participants tables. Pure, so it can be tested without a database.

import { gameDurationSeconds } from "../lib/match-summary";
import type { Match } from "../lib/riot/types";
import type { matches, matchParticipants } from "./schema";

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
