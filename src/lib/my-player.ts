import "server-only";

import * as Sentry from "@sentry/nextjs";
import { eq } from "drizzle-orm";
import { tables, type Db } from "@/db";
import { database } from "@/lib/match-store";
import { isRegion, type Region } from "@/lib/regions";

// The player a signed-in account marked with "This is me", stored in the
// user_players table (see src/db/schema.ts). Without a database the feature
// just stays off: nothing is found and nothing is saved.

export type MyPlayer = {
  puuid: string;
  region: Region;
  gameName: string;
  tagLine: string;
  // From the player's saved profile, for the header. Null until looked up.
  profileIconId: number | null;
};

// A failed read isn't the same as no player marked. If it were, the "This is
// me" button would offer to mark a profile that already is, and clicking it
// would clear the saved one (#167). So unlike readCache, this says so.
export type ReadMyPlayerResult = { ok: true; player: MyPlayer | null } | { ok: false };

export async function readMyPlayer(userId: string): Promise<ReadMyPlayerResult> {
  const db = database();
  // No DATABASE_URL means the feature is off; one set but not connecting is
  // a failure.
  if (!db) return process.env.DATABASE_URL ? { ok: false } : { ok: true, player: null };
  try {
    // Join players for the current name and region, which change on that
    // player's next profile refresh if they rename themselves.
    const [found] = await db
      .select({
        puuid: tables.players.puuid,
        region: tables.players.region,
        gameName: tables.players.gameName,
        tagLine: tables.players.tagLine,
        profileIconId: tables.players.profileIconId,
      })
      .from(tables.userPlayers)
      .innerJoin(tables.players, eq(tables.userPlayers.puuid, tables.players.puuid))
      .where(eq(tables.userPlayers.userId, userId))
      .limit(1);
    const player = found && isRegion(found.region) ? { ...found, region: found.region } : null;
    return { ok: true, player };
  } catch (error) {
    Sentry.captureException(error);
    return { ok: false };
  }
}

// Returns false when it couldn't be saved, for example a PUUID Turnpoint has
// never looked up (the players row must exist first).
export async function saveMyPlayer(userId: string, puuid: string): Promise<boolean> {
  return write((db) =>
    db
      .insert(tables.userPlayers)
      .values({ userId, puuid })
      // Picking a new player replaces the old one: an account has at most one.
      .onConflictDoUpdate({
        target: tables.userPlayers.userId,
        set: { puuid, linkedAt: new Date() },
      }),
  );
}

export async function forgetMyPlayer(userId: string): Promise<boolean> {
  return write((db) =>
    db.delete(tables.userPlayers).where(eq(tables.userPlayers.userId, userId)),
  );
}

async function write(run: (db: Db) => Promise<unknown>): Promise<boolean> {
  const db = database();
  if (!db) return false;
  try {
    await run(db);
    return true;
  } catch (error) {
    Sentry.captureException(error);
    return false;
  }
}
