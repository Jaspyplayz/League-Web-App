import "server-only";

import * as Sentry from "@sentry/nextjs";
import { and, desc, eq, gte, isNull } from "drizzle-orm";
import { after } from "next/server";
import { tables } from "@/db";
import { MIN_ANALYZED_SECONDS } from "@/lib/analyzer";
import {
  recordGame,
  recordsSetBy,
  seasonRecords,
  type RecordGame,
  type RecordLine,
  type RoleRecords,
} from "@/lib/analyzer/records";
import { TRIM_VERSION, type TrimmedEvent, type TrimmedFrame, type TrimmedTimeline } from "@/lib/analyzer/trim";
import { database, readCache } from "@/lib/match-store";
import type { Match } from "@/lib/riot/types";
import { SEASON } from "@/lib/season";

// A player's personal records (src/lib/analyzer/records.ts), from every game
// this season whose timeline Turnpoint has saved: the games someone opened,
// and the ones Insights read. Records need the minute-by-minute timeline
// (CS at 10, level 6), and fetching a whole season of timelines from Riot
// would use up the rate limit, so this never calls Riot.
//
// Each game's numbers are worked out once from the saved match and timeline
// and kept in record_games, a few small rows a game. A page view works out
// at most `budget` new ones, so a player with hundreds of saved games fills
// in over a few visits instead of making one page slow.

// Bump when a stat's rule in records.ts changes: rows saved by an older
// version are worked out again.
export const RECORDS_VERSION = 1;

// New games worked out per view. Each one reads a match and a timeline,
// about 100 KB together.
const MATCH_PAGE_BUDGET = 10;
const CHAMPIONS_TAB_BUDGET = 25;

// The records a game set, for the 60-second review: compared with the
// player's other games this season in the same queue. Null without a
// database (or if it can't be read), and empty for a game from an earlier
// season.
export async function gameRecords(
  match: Match,
  timeline: TrimmedTimeline,
  puuid: string,
): Promise<RecordLine[] | null> {
  // This game is worked out from what the page already loaded; it's saved
  // with the others on a later visit, once its timeline is in the database.
  const game = recordGame(match, timeline, puuid);
  if (!game || game.startedAt < SEASON.start) return [];
  const games = await seasonRecordGames(puuid, MATCH_PAGE_BUDGET);
  if (!games) return null;
  return recordsSetBy(
    game,
    games.filter((g) => g.queueId === game.queueId),
  );
}

export type SeasonRecords = {
  roles: RoleRecords[];
  // Games the records come from, in the chosen queue.
  games: number;
};

// The season's records for the Champions tab. `queueIds` limits them to one
// game mode, as the tab's queue filter does; null is every mode.
export async function loadSeasonRecords(
  puuid: string,
  queueIds: number[] | null,
): Promise<SeasonRecords | null> {
  const games = await seasonRecordGames(puuid, CHAMPIONS_TAB_BUDGET);
  if (!games) return null;
  const counted = queueIds ? games.filter((g) => queueIds.includes(g.queueId)) : games;
  return { roles: seasonRecords(counted), games: counted.length };
}

// The player's saved numbers for every game this season, plus up to
// `budget` games worked out now from saved timelines. Null without a
// database, or when record_games can't be read (say, before migration 0019).
async function seasonRecordGames(puuid: string, budget: number): Promise<RecordGame[] | null> {
  if (!database()) return null;
  const { recordGames: rg } = tables;
  const rows = await readCache((db) =>
    db
      .select()
      .from(rg)
      .where(
        and(
          eq(rg.puuid, puuid),
          eq(rg.version, RECORDS_VERSION),
          gte(rg.gameStartAt, new Date(SEASON.start)),
        ),
      ),
  );
  if (!rows) return null;

  const saved = rows.map(fromRow);
  const fresh = await workOutMissing(puuid, budget);
  return [...saved, ...fresh];
}

// Season games with a saved timeline but no up-to-date row yet, newest
// first, worked out from the match and timeline and saved after the page is
// sent.
async function workOutMissing(puuid: string, budget: number): Promise<RecordGame[]> {
  const { matches, matchParticipants: mp, matchTimelines: mt, recordGames: rg } = tables;
  const missing = await readCache((db) =>
    db
      .select({ raw: matches.raw, frames: mt.frames, events: mt.events })
      .from(mp)
      .innerJoin(matches, eq(matches.matchId, mp.matchId))
      .innerJoin(mt, eq(mt.matchId, mp.matchId))
      .leftJoin(
        rg,
        and(
          eq(rg.matchId, mp.matchId),
          eq(rg.puuid, mp.puuid),
          eq(rg.version, RECORDS_VERSION),
        ),
      )
      .where(
        and(
          eq(mp.puuid, puuid),
          gte(matches.gameStartAt, new Date(SEASON.start)),
          gte(matches.durationS, MIN_ANALYZED_SECONDS),
          // Older timelines can be missing events, as in loadTimeline.
          eq(mt.trimVersion, TRIM_VERSION),
          isNull(rg.matchId),
        ),
      )
      .orderBy(desc(matches.gameStartAt))
      .limit(budget),
  );
  if (!missing?.length) return [];

  const games = missing.flatMap((row) => {
    const timeline = { frames: row.frames as TrimmedFrame[], events: row.events as TrimmedEvent[] };
    return recordGame(row.raw as Match, timeline, puuid) ?? [];
  });
  saveLater(puuid, games);
  return games;
}

function saveLater(puuid: string, games: RecordGame[]) {
  const db = database();
  if (!db || games.length === 0) return;
  const { recordGames: rg } = tables;
  after(async () => {
    try {
      for (const game of games) {
        const row = toRow(puuid, game);
        await db
          .insert(rg)
          .values(row)
          .onConflictDoUpdate({ target: [rg.matchId, rg.puuid], set: row });
      }
    } catch (error) {
      // The records still show; these games are worked out again next time.
      Sentry.captureException(error);
    }
  });
}

type Row = typeof tables.recordGames.$inferSelect;

function toRow(puuid: string, g: RecordGame): Row {
  return {
    matchId: g.matchId,
    puuid,
    championName: g.championName,
    position: g.position,
    queueId: g.queueId,
    gameStartAt: new Date(g.startedAt),
    win: g.win,
    csAt10: g.stats.csAt10,
    goldAt15: g.stats.goldAt15,
    level6S: g.stats.level6,
    earlyDeaths: g.stats.earlyDeaths,
    earlyTakedowns: g.stats.earlyTakedowns,
    version: RECORDS_VERSION,
  };
}

function fromRow(row: Row): RecordGame {
  return {
    matchId: row.matchId,
    startedAt: row.gameStartAt.getTime(),
    queueId: row.queueId,
    championName: row.championName,
    position: row.position,
    win: row.win,
    stats: {
      csAt10: row.csAt10,
      goldAt15: row.goldAt15,
      level6: row.level6S,
      earlyDeaths: row.earlyDeaths,
      earlyTakedowns: row.earlyTakedowns,
    },
  };
}
