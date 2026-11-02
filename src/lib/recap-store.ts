import "server-only";

import * as Sentry from "@sentry/nextjs";
import { and, count, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { tables, type Db } from "@/db";
import { loadMatchFacts } from "@/lib/match-facts";
import { database, loadMatch, readCache } from "@/lib/match-store";
import { RECAP_MODEL, writeRecap, type Recap } from "@/lib/recap";
import type { Region } from "@/lib/regions";

// Reads and writes AI recaps in the match_recaps table, and counts each
// account's tries in recap_tries (see src/db/schema.ts).

// Tries at a new recap one account can make in 24 hours, whether they worked
// or not. Each costs under a tenth of a cent, so this isn't about a normal
// player's bill: it stops one account from writing recaps for thousands of
// games, and from spending the site's shared Riot limit on them.
export const RECAPS_PER_DAY = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function readRecap(matchId: string, puuid: string): Promise<Recap | null> {
  const row = await readCache((db) =>
    db.query.matchRecaps.findFirst({
      columns: { headline: true, detail: true },
      where: and(eq(tables.matchRecaps.matchId, matchId), eq(tables.matchRecaps.puuid, puuid)),
    }),
  );
  return row ?? null;
}

// One player's recap headlines for a list of games, by match ID, for the Log tab.
export async function readRecapHeadlines(
  puuid: string,
  matchIds: string[],
): Promise<Map<string, string>> {
  if (matchIds.length === 0) return new Map();
  const rows = await readCache((db) =>
    db.query.matchRecaps.findMany({
      columns: { matchId: true, headline: true },
      where: and(
        eq(tables.matchRecaps.puuid, puuid),
        inArray(tables.matchRecaps.matchId, matchIds),
      ),
    }),
  );
  return new Map((rows ?? []).map((r) => [r.matchId, r.headline]));
}

export type CreateRecapResult =
  | { status: "written"; recap: Recap }
  | { status: "failed"; message: string };

// Writes and saves the recap of one game from one player's side, unless it
// already exists. Everything is worked out again here from the stored match,
// never taken from the browser, so nobody can feed Claude made-up facts.
export async function createRecap(
  region: Region,
  matchId: string,
  puuid: string,
  userId: string,
): Promise<CreateRecapResult> {
  const db = database();
  if (!db) return { status: "failed", message: "Recaps aren't available right now." };

  const existing = await readRecap(matchId, puuid);
  if (existing) return { status: "written", recap: existing };

  try {
    // The try is saved before Riot or Claude is called, and kept whatever
    // happens after, so a failed try counts too.
    if (!(await reserveTry(db, userId))) {
      return {
        status: "failed",
        message: `You've asked for ${RECAPS_PER_DAY} recaps today. Try again tomorrow.`,
      };
    }

    const match = await loadMatch(region, matchId);
    const facts = await loadMatchFacts(region, match, puuid);
    if (!facts) return { status: "failed", message: "This game is too short to recap." };

    const recap = await writeRecap(facts);
    if (!recap) return { status: "failed", message: "Couldn't write a recap for this game." };

    await db
      .insert(tables.matchRecaps)
      .values({ matchId, puuid, ...recap, model: RECAP_MODEL })
      // Two clicks at once: keep the first recap.
      .onConflictDoNothing();
    return { status: "written", recap };
  } catch (error) {
    Sentry.captureException(error);
    return { status: "failed", message: "Couldn't write the recap. Try again in a moment." };
  }
}

// Counts this account's tries in the last 24 hours and, if it has one left,
// saves a new one, in one transaction. The transaction takes a lock for this
// account (an "advisory lock", like Ask's reserve() in src/lib/ask-store.ts),
// so tries sent at the same moment take turns: the second one's count sees
// the first one's row. One lock per account, not one for the whole site like
// Ask's, because recaps have no shared budget. It's let go when the
// transaction ends, before Riot or Claude is called.
async function reserveTry(db: Db, userId: string): Promise<boolean> {
  const since = new Date(Date.now() - DAY_MS);
  // A try waiting for the lock keeps one of the server's few database
  // connections busy, so an account that's already used its tries is turned
  // away here, without the lock. The count can only be too low here, never
  // too high, so this never turns away a try the locked count would allow.
  if ((await countTries(db, userId, since)) >= RECAPS_PER_DAY) return false;

  return db.transaction(async (tx) => {
    // A try holds the lock for a few milliseconds, so a wait this long means
    // something's wrong: give up, and the try fails without counting.
    await tx.execute(sql`set local lock_timeout = '3s'`);
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('recap-tries'), hashtext(${userId}))`,
    );
    // Tries more than a day old no longer count, so they aren't kept.
    await tx
      .delete(tables.recapTries)
      .where(and(eq(tables.recapTries.userId, userId), lt(tables.recapTries.createdAt, since)));
    if ((await countTries(tx, userId, since)) >= RECAPS_PER_DAY) return false;
    await tx.insert(tables.recapTries).values({ userId });
    return true;
  });
}

// Takes the database or a transaction.
async function countTries(db: Pick<Db, "select">, userId: string, since: Date): Promise<number> {
  const [tried] = await db
    .select({ n: count() })
    .from(tables.recapTries)
    .where(and(eq(tables.recapTries.userId, userId), gte(tables.recapTries.createdAt, since)));
  return tried.n;
}
