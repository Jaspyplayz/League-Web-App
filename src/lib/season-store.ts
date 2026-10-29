import "server-only";

import * as Sentry from "@sentry/nextjs";
import { and, eq, gte, inArray } from "drizzle-orm";
import { tables, type Db } from "@/db";
import { seasonGameRow } from "@/db/rows";
import { mapWithLimit } from "@/lib/concurrency";
import { database, readCache, remember, type SaveTiming } from "@/lib/match-store";
import { isRegion, type Region } from "@/lib/regions";
import { getMatch, getMatchIds } from "@/lib/riot/api";
import { settle, type RiotApiError } from "@/lib/riot/client";
import { SEASON, seasonChampions, type SeasonChampion, type SeasonGame } from "@/lib/season";

// The season's most played champions, over every game of the season, not
// just the 10 on the profile.
//
// A season can be hundreds of games, each one Riot call the first time, and
// the key allows 100 calls per 2 minutes. So the games fill in over time:
// - every visit to the plain profile page loads up to GAMES_PER_VIEW more,
// - and once a day a scheduled job (src/app/api/cron/season-sync/route.ts)
//   loads up to SYNC_GAMES for the players someone marked "This is me", so
//   their season stays complete without anyone opening the page.
// The panel says how many are in so far.
//
// The box needs only each game's champion, result, K/D/A, CS and length, so
// a game loaded for it is saved as one small season_games row (about 100
// bytes) instead of the whole match (about 90 KB). Games already saved in
// matches, by the match list or a match page, count too, so no game costs a
// Riot call twice.
//
// Only the plain page loads more (the caller passes { loadMore: true }; see
// isPlainProfilePage in src/lib/more-games.ts). Its game-mode
// tabs and "Show 10 more games" lists are separate URLs, and a crawler that
// opened all of them would load 10 games on each, dozens of URLs per player.
//
// Needs the database to remember games between visits; without one this
// returns null and the profile shows its last 10 games' champions instead.

const GAMES_PER_VIEW = 10;
// Riot lists at most 100 match IDs per request. 10 pages is 1,000 games,
// more than almost anyone plays in a season.
const IDS_PER_PAGE = 100;
const MAX_PAGES = 10;
// Riot allows 20 requests a second, so ask for at most 5 games at a time.
const MATCH_CONCURRENCY = 5;

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
  // Whether this view may ask Riot for a few of the games not saved yet.
  { loadMore }: { loadMore: boolean },
): Promise<SeasonStats | null> {
  if (!database()) return null;

  const ids = await seasonMatchIds(region, puuid, profileUpdatedAt);
  if (!ids) return null;

  const games = await savedGames(puuid, ids);
  // Load a few of the missing games. They're saved after the page is sent,
  // so they're counted here from memory.
  const missing = loadMore ? missingIds(ids, games).slice(0, GAMES_PER_VIEW) : [];
  const fetched = await fetchSeasonGames(region, puuid, missing, "after");
  games.push(...fetched.games);

  return {
    champions: seasonChampions(games, queueIds),
    loaded: games.length,
    total: ids.length,
  };
}

// Games the daily job may ask Riot for in one run, across every player.
// Leaves room in the 100 calls per 2 minutes for the job's match ID lists
// (one call per 100 games) and for anyone using the site at the time.
export const SYNC_GAMES = 60;

export type SyncResult = {
  player: string; // "Name#TAG", for the job's log
  saved: number; // games loaded and saved this run
  left: number; // season games still missing after this run
  error: string | null; // why some games couldn't be loaded this run
};

// The daily job: refresh the season's match list for every player someone
// marked "This is me", then save their missing games, newest first, until
// SYNC_GAMES are used up. A long backlog finishes over the next days.
export async function syncSeasons(): Promise<SyncResult[]> {
  const db = database();
  if (!db) return [];
  const { players, userPlayers } = tables;
  // Two accounts can pick the same player; one sync each is enough.
  const tracked = await db
    .selectDistinct({
      puuid: players.puuid,
      region: players.region,
      name: players.gameName,
      tag: players.tagLine,
    })
    .from(userPlayers)
    .innerJoin(players, eq(players.puuid, userPlayers.puuid));

  const results: SyncResult[] = [];
  let budget = SYNC_GAMES;
  for (const player of tracked) {
    if (budget <= 0 || !isRegion(player.region)) continue;
    const result = await syncSeason(player.region, player.puuid, budget);
    budget -= result.tried;
    results.push({
      player: `${player.name}#${player.tag}`,
      saved: result.saved,
      left: result.left,
      error: result.error,
    });
  }
  return results;
}

async function syncSeason(region: Region, puuid: string, budget: number) {
  // Passing now makes the saved list count as stale, so Riot is asked for a
  // fresh one with the games played since yesterday.
  const ids = await seasonMatchIds(region, puuid, new Date());
  if (!ids) return { tried: 0, saved: 0, left: 0, error: "Couldn't list the season's games" };

  const missing = missingIds(ids, await savedGames(puuid, ids));
  const batch = missing.slice(0, budget);
  // "now", so the rows are written before the job reports what it saved.
  const fetched = await fetchSeasonGames(region, puuid, batch, "now");
  return {
    tried: batch.length,
    saved: fetched.games.length,
    left: missing.length - fetched.games.length,
    error: fetched.error?.message ?? null,
  };
}

// The season's IDs not counted yet, newest first.
function missingIds(ids: string[], games: SeasonGame[]): string[] {
  const saved = new Set(games.map((g) => g.matchId));
  return ids.filter((id) => !saved.has(id));
}

// Asks Riot for each game, keeps the player's line and saves it to
// season_games. A game Riot can't send right now is left for next time;
// `error` says why.
async function fetchSeasonGames(
  region: Region,
  puuid: string,
  ids: string[],
  timing: SaveTiming,
): Promise<{ games: SeasonGame[]; error: RiotApiError | null }> {
  const fetched = await mapWithLimit(ids, MATCH_CONCURRENCY, (id) => settle(getMatch(region, id)));
  const rows: (typeof tables.seasonGames.$inferInsert)[] = [];
  let error: RiotApiError | null = null;
  for (const result of fetched) {
    if (!result.ok) {
      error ??= result.error;
      continue;
    }
    const row = seasonGameRow(result.value, puuid);
    // The ID list starts at the season, so this only skips odd games.
    if (row && row.gameStartAt.getTime() >= SEASON.start) rows.push(row);
  }
  if (rows.length > 0) {
    await remember(timing, async (db: Db) => {
      await db.insert(tables.seasonGames).values(rows).onConflictDoNothing();
    });
  }
  return { games: rows.map(toSeasonGame), error };
}

function toSeasonGame(row: typeof tables.seasonGames.$inferInsert): SeasonGame {
  return {
    matchId: row.matchId,
    queueId: row.queueId,
    durationS: row.durationS,
    championName: row.championName,
    win: row.win,
    kills: row.kills,
    deaths: row.deaths,
    assists: row.assists,
    cs: row.cs,
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

// The player's line in each season game saved so far: from season_games,
// and from matches for games saved whole by the match list or a match page.
// Two small queries for just the few numbers the stats need, not the whole
// match JSON.
async function savedGames(puuid: string, ids: string[]): Promise<SeasonGame[]> {
  if (ids.length === 0) return [];
  const since = new Date(SEASON.start);
  const { matches, matchParticipants: mp, seasonGames: sg } = tables;
  const [slim, whole] = await Promise.all([
    readCache((db) =>
      db
        .select({
          matchId: sg.matchId,
          queueId: sg.queueId,
          durationS: sg.durationS,
          championName: sg.championName,
          win: sg.win,
          kills: sg.kills,
          deaths: sg.deaths,
          assists: sg.assists,
          cs: sg.cs,
        })
        .from(sg)
        .where(and(eq(sg.puuid, puuid), inArray(sg.matchId, ids), gte(sg.gameStartAt, since))),
    ),
    readCache((db) =>
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
        .where(and(eq(mp.puuid, puuid), inArray(mp.matchId, ids), gte(matches.gameStartAt, since))),
    ),
  ]);
  // A game in both tables counts once.
  const games = new Map<string, SeasonGame>();
  for (const game of [...(slim ?? []), ...(whole ?? [])]) games.set(game.matchId, game);
  return [...games.values()];
}
