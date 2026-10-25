import "server-only";

import * as Sentry from "@sentry/nextjs";
import { eq, inArray } from "drizzle-orm";
import { after } from "next/server";
import { getDb, tables, type Db } from "@/db";
import { matchRow, participantRows } from "@/db/rows";
import { keepsItemChanges } from "@/lib/analyzer/items";
import {
  TRIM_VERSION,
  trimTimeline,
  type TrimmedEvent,
  type TrimmedFrame,
  type TrimmedTimeline,
} from "@/lib/analyzer/trim";
import { mapWithLimit } from "@/lib/concurrency";
import type { Region } from "@/lib/regions";
import { getMatch, getTimeline } from "@/lib/riot/api";
import { RiotApiError, settle } from "@/lib/riot/client";
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

// Many matches at once, for the insights page. Like loadTimelines below:
// cached ones come from one database query, and at most `budget` missing
// ones are fetched from Riot per call, so a 100-game window can't use up the
// rate limit in one page view. Returns the loaded matches in the order of
// `ids`; `waiting` counts the ones still to fetch or that failed.
export async function loadMatches(
  region: Region,
  ids: string[],
  budget: number,
  timing: SaveTiming = "after",
): Promise<{ matches: Match[]; waiting: number; error: RiotApiError | null }> {
  const found = new Map<string, Match>();
  const rows = ids.length
    ? await readCache((db) =>
        db.query.matches.findMany({
          where: inArray(tables.matches.matchId, ids),
          columns: { matchId: true, raw: true },
        }),
      )
    : undefined;
  for (const row of rows ?? []) found.set(row.matchId, row.raw as Match);

  // Without a database nothing is remembered between page views, so fetch
  // everything now, as loadTimelines does.
  const limit = database() ? budget : ids.length;
  const missing = ids.filter((id) => !found.has(id)).slice(0, limit);
  const fetched = await mapWithLimit(missing, MATCH_CONCURRENCY, (id) =>
    settle(getMatch(region, id)),
  );
  let error: RiotApiError | null = null;
  for (const result of fetched) {
    if (!result.ok) {
      error ??= result.error;
      continue;
    }
    const match = result.value;
    found.set(match.metadata.matchId, match);
    await remember(timing, (db) => saveMatch(db, match));
  }

  const matches = ids.flatMap((id) => found.get(id) ?? []);
  return { matches, waiting: ids.length - matches.length, error };
}

// Riot allows 20 requests a second, so ask for at most 5 matches at a time.
const MATCH_CONCURRENCY = 5;

// Costs one Riot call the first time anyone opens a match, and none after.
// The match page passes `items`: a timeline saved before Turnpoint kept item
// sales and used-up items is fetched once more, so the replay can show each
// player's items. If Riot can't answer, the saved copy does without them.
export async function loadTimeline(
  region: Region,
  match: Match,
  { items = false }: { items?: boolean } = {},
): Promise<TrimmedTimeline> {
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
    const saved = { frames: cached.frames as TrimmedFrame[], events: cached.events as TrimmedEvent[] };
    if (!items || keepsItemChanges(saved)) return saved;
    const fresh = await settle(fetchTimeline(region, match));
    return fresh.ok ? fresh.value : saved;
  }

  return fetchTimeline(region, match);
}

// Timelines for many matches at once, for the insights page. Cached ones come
// from a single database query. At most `budget` missing ones are fetched
// from Riot, so one page view can't use up the rate limit: the page shows what
// it has and asks again for the rest. Matches that couldn't be loaded are
// simply left out of the result; `error` says why, if Riot refused.
export async function loadTimelines(
  region: Region,
  matches: Match[],
  budget: number,
  timing: SaveTiming = "after",
): Promise<{ timelines: Map<string, TrimmedTimeline>; error: RiotApiError | null }> {
  const timelines = new Map<string, TrimmedTimeline>();
  const ids = matches.map((m) => m.metadata.matchId);
  const rows = ids.length
    ? await readCache((db) =>
        db.query.matchTimelines.findMany({
          where: inArray(tables.matchTimelines.matchId, ids),
          columns: { matchId: true, frames: true, events: true, trimVersion: true },
        }),
      )
    : undefined;
  for (const row of rows ?? []) {
    if (row.trimVersion !== TRIM_VERSION) continue;
    timelines.set(row.matchId, {
      frames: row.frames as TrimmedFrame[],
      events: row.events as TrimmedEvent[],
    });
  }

  // Without a database nothing is remembered between page views, so there's
  // no point spreading the work out: fetch everything now.
  const limit = database() ? budget : matches.length;
  const missing = matches.filter((m) => !timelines.has(m.metadata.matchId)).slice(0, limit);
  const fetched = await mapWithLimit(missing, TIMELINE_CONCURRENCY, (m) =>
    settle(fetchTimeline(region, m, timing)),
  );
  let error: RiotApiError | null = null;
  for (const [i, result] of fetched.entries()) {
    if (result.ok) timelines.set(missing[i].metadata.matchId, result.value);
    else error ??= result.error;
  }
  return { timelines, error };
}

// Riot allows 20 requests a second, so ask for at most 5 timelines at a time.
const TIMELINE_CONCURRENCY = 5;

// Downloads a timeline from Riot, trims it, and saves it for next time.
async function fetchTimeline(
  region: Region,
  match: Match,
  timing: SaveTiming = "after",
): Promise<TrimmedTimeline> {
  const { matchId } = match.metadata;
  const timeline = trimTimeline(await getTimeline(region, matchId));
  await remember(timing, async (db) => {
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
export function database(): Db | null {
  if (!process.env.DATABASE_URL) return null;
  try {
    return getDb();
  } catch (error) {
    Sentry.captureException(error);
    return null;
  }
}

// Runs a cache lookup. Any failure counts as a cache miss.
export async function readCache<T>(read: (db: Db) => Promise<T | undefined>): Promise<T | undefined> {
  const db = database();
  if (!db) return undefined;
  try {
    return await read(db);
  } catch (error) {
    Sentry.captureException(error);
    return undefined;
  }
}

// "after" writes once the response is on its way, so a page doesn't wait.
// "now" waits for the write, for the Insights batch: the next read has to
// see the rows, and a write scheduled with after() can still be pending.
export type SaveTiming = "after" | "now";

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

async function remember(timing: SaveTiming, write: (db: Db) => Promise<void>) {
  if (timing === "after") {
    saveLater(write);
    return;
  }
  const db = database();
  if (!db) return;
  try {
    await write(db);
  } catch (error) {
    Sentry.captureException(error);
  }
}
