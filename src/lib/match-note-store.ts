import "server-only";

import * as Sentry from "@sentry/nextjs";
import { and, eq } from "drizzle-orm";
import { tables } from "@/db";
import type { ReadNoteResult } from "@/lib/match-note";
import { database } from "@/lib/match-store";
import { readOwnData } from "@/lib/own-data";

// Reads and saves notes in the match_notes table (see src/db/schema.ts).
// Without a database, nothing is found and saving reports a failure. Reads
// go through readOwnData, not readCache, which treats a failed read as
// nothing found (see ReadNoteResult).

export async function readMatchNote(userId: string, matchId: string): Promise<ReadNoteResult> {
  const result = await readOwnData(async (db) => {
    const row = await db.query.matchNotes.findFirst({
      columns: { text: true },
      where: and(eq(tables.matchNotes.userId, userId), eq(tables.matchNotes.matchId, matchId)),
    });
    return row?.text ?? "";
  }, "");
  return result.ok ? { ok: true, text: result.value } : result;
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
