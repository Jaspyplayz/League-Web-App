import "server-only";

import * as Sentry from "@sentry/nextjs";
import { and, eq, gte, inArray } from "drizzle-orm";
import { tables } from "@/db";
import { database, loadMatches, readCache } from "@/lib/match-store";
import { gameDurationSeconds } from "@/lib/match-summary";
import type { Region } from "@/lib/regions";
import { getMatchIds } from "@/lib/riot/api";
import { settle } from "@/lib/riot/client";
import { SEASON, seasonChampions, type SeasonChampion, type SeasonGame } from "@/lib/season";

// The season's most played champions, over every game of the season, not
// just the 10 on the profile.
//
// A season can be hundreds of games, each one Riot call the first time, and
// the dev key allows 100 calls per 2 minutes. So the games fill in over time:
// every profile visit loads up to GAMES_PER_VIEW more and saves them, and the
// panel says how many are in so far. Saved games never cost a call again.
//
// Needs the database to remember games between visits; without one this
// returns null and the profile shows its last 10 games' champions instead.

const GAMES_PER_VIEW = 10;
// Riot lists at most 100 match IDs per request. 10 pages is 1,000 games,
// more than almost anyone plays in a season.
const IDS_PER_PAGE = 100;
const MAX_PAGES = 10;

export type SeasonStats = {
  champions: SeasonChampion[];
  loaded: number; // season games in so far, every game mode
  total: number; // games played this season, every game mode
};

export async function loadSeasonStats(
  region: Region,
  puuid: string,
  // When the profile snapshot was fetched. The season's match list is
  // refreshed along with it, so it costs Riot calls once a day at most.
  profileUpdatedAt: Date,
  queueIds: number[] | null,
): Promise<SeasonStats | null> {
  if (!database()) return null;

  const ids = await seasonMatchIds(region, puuid, profileUpdatedAt);
  if (!ids) return null;

  const games = await savedGames(puuid, ids);
  // Load a few of the missing games. Like the match list, loadMatches saves
  // them after the page is sent, so they're counted here from memory.
  const saved = new Set(games.map((g) => g.matchId));
  const missing = ids.filter((id) => !saved.has(id)).slice(0, GAMES_PER_VIEW);
  const { matches } = await loadMatches(region, missing, GAMES_PER_VIEW);
  for (const match of matches) {
    const me = match.info.participants.find((p) => p.puuid === puuid);
    if (!me) continue;
    games.push({
      matchId: match.metadata.matchId,
      queueId: match.info.queueId,
      durationS: gameDurationSeconds(match.info),
      championName: me.championName,
      win: me.win,
      kills: me.kills,
      deaths: me.deaths,
      assists: me.assists,
      cs: me.totalMinionsKilled + me.neutralMinionsKilled,
    });
  }

  return {
    champions: seasonChampions(games, queueIds),
    loaded: games.length,
    total: ids.length,
  };
}

// Every match ID this season, newest first. Read from the database while it
// isn't older than the profile snapshot; otherwise asked from Riot again.
// Null if there's no saved list and Riot can't be reached.
export async function seasonMatchIds(
  region: Region,
  puuid: string,
  profileUpdatedAt: Date,
): Promise<string[] | null> {
  const row = await readCache((db) =>
    db.query.playerSeasons.findFirst({
      where: and(eq(tables.playerSeasons.puuid, puuid), eq(tables.playerSeasons.season, SEASON.id)),
    }),
  );
  if (row && row.fetchedAt >= profileUpdatedAt) return row.matchIds;

  const fetched = await settle(fetchSeasonMatchIds(region, puuid));
  // A day-old list beats no list when Riot is busy.
  if (!fetched.ok) return row?.matchIds ?? null;

  await saveSeasonMatchIds(puuid, fetched.value);
  return fetched.value;
}

async function fetchSeasonMatchIds(region: Region, puuid: string): Promise<string[]> {
  const ids: string[] = [];
  // Riot takes times in seconds, not milliseconds.
  const startTime = Math.floor(SEASON.start / 1000);
  for (let page = 0; page < MAX_PAGES; page++) {
    const batch = await getMatchIds(region, puuid, IDS_PER_PAGE, {
      startTime,
      start: page * IDS_PER_PAGE,
    });
    ids.push(...batch);
    // A short page is the last one.
    if (batch.length < IDS_PER_PAGE) break;
  }
  return ids;
}

async function saveSeasonMatchIds(puuid: string, matchIds: string[]) {
  const db = database();
  if (!db) return;
  const row = { matchIds, fetchedAt: new Date() };
  try {
    await db
      .insert(tables.playerSeasons)
      .values({ puuid, season: SEASON.id, ...row })
      .onConflictDoUpdate({
        target: [tables.playerSeasons.puuid, tables.playerSeasons.season],
        set: row,
      });
  } catch (error) {
    // The stats still show; the list is just fetched again next time.
    Sentry.captureException(error);
  }
}

// The player's line of the scoreboard in each saved season game. One query,
// and only the few numbers the stats need, not the whole match JSON.
async function savedGames(puuid: string, ids: string[]): Promise<SeasonGame[]> {
  if (ids.length === 0) return [];
  const { matches, matchParticipants: mp } = tables;
  const rows = await readCache((db) =>
    db
      .select({
        matchId: mp.matchId,
        queueId: matches.queueId,
        durationS: matches.durationS,
        championName: mp.championName,
        win: mp.win,
        kills: mp.kills,
        deaths: mp.deaths,
        assists: mp.assists,
        cs: mp.cs,
      })
      .from(mp)
      .innerJoin(matches, eq(matches.matchId, mp.matchId))
      .where(
        and(
          eq(mp.puuid, puuid),
          inArray(mp.matchId, ids),
          gte(matches.gameStartAt, new Date(SEASON.start)),
        ),
      ),
  );
  return rows ?? [];
}
