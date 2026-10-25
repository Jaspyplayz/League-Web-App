import "server-only";

import * as Sentry from "@sentry/nextjs";
import { and, eq } from "drizzle-orm";
import { tables } from "@/db";
import type { ReadNoteResult } from "@/lib/match-note";
import { database } from "@/lib/match-store";

// Reads and saves notes in the match_notes table (see src/db/schema.ts).

export async function readMatchNote(userId: string, matchId: string): Promise<ReadNoteResult> {
  const db = database();
  if (!db) return { ok: true, text: "" };
  try {
    const row = await db.query.matchNotes.findFirst({
      columns: { text: true },
      where: and(eq(tables.matchNotes.userId, userId), eq(tables.matchNotes.matchId, matchId)),
    });
    return { ok: true, text: row?.text ?? "" };
  } catch (error) {
    Sentry.captureException(error);
    return { ok: false };
  }
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
