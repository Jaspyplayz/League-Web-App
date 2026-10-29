import "server-only";

import { and, eq, gte, inArray } from "drizzle-orm";
import { tables } from "@/db";
import { participantRows } from "@/db/rows";
import {
  championStats,
  type ChampionStats,
  type StatsGame,
  type StatsPlayer,
} from "@/lib/champion-stats";
import { SCORE_MODEL } from "@/lib/game-score";
import { database, loadMatches, readCache } from "@/lib/match-store";
import { gameDurationSeconds } from "@/lib/match-summary";
import type { Region } from "@/lib/regions";
import type { RiotApiError } from "@/lib/riot/client";
import { SEASON } from "@/lib/season";
import { seasonMatchIds } from "@/lib/season-store";

// The Champions tab's games: every game of the season that's saved so far,
// plus a few more from Riot on each visit. It shares the season's match list
// with the Season box on the profile (src/lib/season-store.ts), and the Season
// box counts the whole games saved here. Not the other way round: the Season
// box and the daily sync save only the player's own line (season_games),
// and this table needs all ten players, so it loads those games again.
//
// The table needs all ten players of each game (for kill participation,
// damage share, the lane opponent and the game score), read from
// match_participants. That's a few thousand small rows, much faster than
// reading every game's full JSON (about 3 seconds for 600 games).

// Riot calls per visit. The dev key allows 100 per 2 minutes, and other
// parts of the profile need some too.
export const GAMES_PER_VIEW = 10;

export type ChampionTab = ChampionStats & {
  loaded: number; // season games in so far, every game mode
  total: number; // games played this season, every game mode
  error: RiotApiError | null; // why some games couldn't be loaded just now
};

// Null without a database, since a season's worth of games can't be loaded
// in one visit, or when the saved games can't be read.
export async function loadChampionTab(
  region: Region,
  puuid: string,
  profileUpdatedAt: Date,
  queueIds: number[] | null,
): Promise<ChampionTab | null> {
  if (!database()) return null;

  const ids = await seasonMatchIds(region, puuid, profileUpdatedAt);
  if (!ids) return null;

  const games = await savedGames(ids);
  if (!games) return null;

  // Load a few of the missing games. loadMatches saves them after the page
  // is sent, so they're added here from memory.
  const saved = new Set(games.map((g) => g.matchId));
  const missing = ids.filter((id) => !saved.has(id)).slice(0, GAMES_PER_VIEW);
  const { matches, error } = await loadMatches(region, missing, GAMES_PER_VIEW);
  for (const match of matches) {
    if (match.info.gameStartTimestamp < SEASON.start) continue;
    games.push({
      matchId: match.metadata.matchId,
      queueId: match.info.queueId,
      durationS: gameDurationSeconds(match.info),
      // The same rows the database will hold once the game is saved.
      players: participantRows(match).map(toStatsPlayer),
    });
  }

  return {
    ...championStats(games, puuid, queueIds, SCORE_MODEL),
    loaded: games.length,
    total: ids.length,
    error,
  };
}

// Every player's line in each saved season game, grouped by game. Undefined
// rows (a failed query, say before migration 0014 has run) give null.
async function savedGames(ids: string[]): Promise<StatsGame[] | null> {
  if (ids.length === 0) return [];
  const { matches, matchParticipants: mp } = tables;
  const rows = await readCache((db) =>
    db
      .select({
        queueId: matches.queueId,
        durationS: matches.durationS,
        player: mp,
      })
      .from(mp)
      .innerJoin(matches, eq(matches.matchId, mp.matchId))
      .where(and(inArray(mp.matchId, ids), gte(matches.gameStartAt, new Date(SEASON.start)))),
  );
  if (!rows) return null;

  const games = new Map<string, StatsGame>();
  for (const row of rows) {
    const { matchId } = row.player;
    const game = games.get(matchId) ?? {
      matchId,
      queueId: row.queueId,
      durationS: row.durationS,
      players: [],
    };
    game.players.push(toStatsPlayer(row.player));
    games.set(matchId, game);
  }
  return [...games.values()];
}

// A match_participants row, saved or about to be, as the stats read it.
function toStatsPlayer(row: typeof tables.matchParticipants.$inferInsert): StatsPlayer {
  return {
    participantId: row.participantId,
    puuid: row.puuid,
    teamId: row.teamId,
    championName: row.championName,
    teamPosition: row.teamPosition,
    individualPosition: row.individualPosition ?? null,
    win: row.win,
    kills: row.kills,
    deaths: row.deaths,
    assists: row.assists,
    cs: row.cs,
    goldEarned: row.goldEarned,
    damageToChampions: row.damageToChampions,
    damageTaken: row.damageTaken ?? null,
    objectiveDamage: row.objectiveDamage ?? null,
    visionScore: row.visionScore,
    earlySurrender: row.earlySurrender ?? null,
    wardsPlaced: row.wardsPlaced ?? null,
    wardsKilled: row.wardsKilled ?? null,
    controlWards: row.controlWards ?? null,
    doubleKills: row.doubleKills ?? null,
    tripleKills: row.tripleKills ?? null,
    quadraKills: row.quadraKills ?? null,
    pentaKills: row.pentaKills ?? null,
    csAt10: row.csAt10 ?? null,
  };
}
