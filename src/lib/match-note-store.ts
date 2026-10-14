import "server-only";

import * as Sentry from "@sentry/nextjs";
import { and, eq } from "drizzle-orm";
import { tables } from "@/db";
import { database, readCache } from "@/lib/match-store";

// Reads and saves notes in the match_notes table (see src/db/schema.ts).
// Without a database, nothing is found and saving reports a failure.

export async function readMatchNote(userId: string, matchId: string): Promise<string | null> {
  const row = await readCache((db) =>
    db.query.matchNotes.findFirst({
      columns: { text: true },
      where: and(eq(tables.matchNotes.userId, userId), eq(tables.matchNotes.matchId, matchId)),
    }),
  );
  return row?.text ?? null;
}

// Saves the note, or deletes it when the text is empty. Returns false when
// it couldn't, for example a match Turnpoint hasn't stored.
export async function writeMatchNote(
  userId: string,
  matchId: string,
  text: string,
): Promise<boolean> {
  const db = database();
  if (!db) return false;
  const key = and(eq(tables.matchNotes.userId, userId), eq(tables.matchNotes.matchId, matchId));
  try {
    if (text === "") {
      await db.delete(tables.matchNotes).where(key);
    } else {
      await db
        .insert(tables.matchNotes)
        .values({ userId, matchId, text })
        .onConflictDoUpdate({
          target: [tables.matchNotes.userId, tables.matchNotes.matchId],
          set: { text, updatedAt: new Date() },
        });
    }
    return true;
  } catch (error) {
    Sentry.captureException(error);
    return false;
  }
}
