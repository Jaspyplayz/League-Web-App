import "server-only";

import * as Sentry from "@sentry/nextjs";
import { eq } from "drizzle-orm";
import { after } from "next/server";
import { getDb, tables, type Db } from "@/db";
import { matchRow, participantRows } from "@/db/rows";
import {
  TRIM_VERSION,
  trimTimeline,
  type TrimmedEvent,
  type TrimmedFrame,
  type TrimmedTimeline,
} from "@/lib/analyzer/trim";
import type { Region } from "@/lib/regions";
import { getMatch, getTimeline } from "@/lib/riot/api";
import type { Match } from "@/lib/riot/types";

// Matches and timelines never change once a game is over, so each is fetched
// from Riot once and kept in Postgres from then on. Pages call these
// functions instead of the Riot API directly.
//
// The database is only a cache. If DATABASE_URL isn't set (say, on a fresh
// local checkout) or a query fails, the page still works by asking Riot; the
// failure goes to Sentry so we hear about it.

export async function loadMatch(region: Region, matchId: string): Promise<Match> {
  const cached = await readCache((db) =>
    db.query.matches.findFirst({
      where: eq(tables.matches.matchId, matchId),
      columns: { raw: true },
    }),
  );
  if (cached) return cached.raw as Match;

  const match = await getMatch(region, matchId);
  saveLater((db) => saveMatch(db, match));
  return match;
}

// Costs one Riot call the first time anyone opens a match, and none after.
export async function loadTimeline(region: Region, match: Match): Promise<TrimmedTimeline> {
  const { matchId } = match.metadata;
  const cached = await readCache((db) =>
    db.query.matchTimelines.findFirst({
      where: eq(tables.matchTimelines.matchId, matchId),
      columns: { frames: true, events: true, trimVersion: true },
    }),
  );
  // A row trimmed by an older version of trimTimeline may be missing fields
  // the analyzer now reads, so it's fetched again and replaced.
  if (cached?.trimVersion === TRIM_VERSION) {
    return { frames: cached.frames as TrimmedFrame[], events: cached.events as TrimmedEvent[] };
  }

  const timeline = trimTimeline(await getTimeline(region, matchId));
  saveLater(async (db) => {
    // The timeline row points at the match row, so make sure that's there.
    await saveMatch(db, match);
    const row = { frames: timeline.frames, events: timeline.events, trimVersion: TRIM_VERSION };
    await db
      .insert(tables.matchTimelines)
      .values({ matchId, ...row })
      .onConflictDoUpdate({
        target: tables.matchTimelines.matchId,
        set: { ...row, fetchedAt: new Date() },
      });
  });
  return timeline;
}

// Stores a match and its scoreboard rows. Safe to call more than once: a
// match that's already stored is left alone.
async function saveMatch(db: Db, match: Match) {
  await db.transaction(async (tx) => {
    await tx.insert(tables.matches).values(matchRow(match)).onConflictDoNothing();
    await tx.insert(tables.matchParticipants).values(participantRows(match)).onConflictDoNothing();
  });
}

// Null when there's no usable database, so callers go straight to Riot.
// A malformed DATABASE_URL (say, a password with a "#" that isn't
// URL-encoded) makes getDb() throw; that must not break the page either.
function database(): Db | null {
  if (!process.env.DATABASE_URL) return null;
  try {
    return getDb();
  } catch (error) {
    Sentry.captureException(error);
    return null;
  }
}

// Runs a cache lookup. Any failure counts as a cache miss.
async function readCache<T>(read: (db: Db) => Promise<T | undefined>): Promise<T | undefined> {
  const db = database();
  if (!db) return undefined;
  try {
    return await read(db);
  } catch (error) {
    Sentry.captureException(error);
    return undefined;
  }
}

// Saves to the cache after the page has been sent, so a visitor never waits
// for the write. See https://nextjs.org/docs/app/api-reference/functions/after
function saveLater(write: (db: Db) => Promise<void>) {
  const db = database();
  if (!db) return;
  after(async () => {
    try {
      await write(db);
    } catch (error) {
      Sentry.captureException(error);
    }
  });
}
