import "server-only";

import * as Sentry from "@sentry/nextjs";
import { and, eq, gte } from "drizzle-orm";
import { tables } from "@/db";
import type { ReadDayNotesResult } from "@/lib/match-note";
import { database } from "@/lib/match-store";
import { readOwnData } from "@/lib/own-data";

// Reads and saves the notes on Log tab days, in the day_notes table (see
// src/db/schema.ts). Works like match-note-store.ts: without a database,
// nothing is found and saving reports a failure, and a failed read is
// reported as one.

// The account's notes from `since` ("2026-09-18") on, by day. The server
// doesn't know the viewer's timezone, so it can't say exactly which days the
// page will show; the caller asks for a few days extra.
export async function readDayNotes(userId: string, since: string): Promise<ReadDayNotesResult> {
  const result = await readOwnData(async (db) => {
    const rows = await db.query.dayNotes.findMany({
      columns: { day: true, text: true },
      where: and(eq(tables.dayNotes.userId, userId), gte(tables.dayNotes.day, since)),
    });
    return Object.fromEntries(rows.map((r) => [r.day, r.text]));
  }, {});
  return result.ok ? { ok: true, byDay: result.value } : result;
}

// Saves the note, or deletes it when the text is empty. Returns false when
// it couldn't.
export async function writeDayNote(userId: string, day: string, text: string): Promise<boolean> {
  const db = database();
  if (!db) return false;
  const key = and(eq(tables.dayNotes.userId, userId), eq(tables.dayNotes.day, day));
  try {
    if (text === "") {
      await db.delete(tables.dayNotes).where(key);
    } else {
      await db
        .insert(tables.dayNotes)
        .values({ userId, day, text })
        .onConflictDoUpdate({
          target: [tables.dayNotes.userId, tables.dayNotes.day],
          set: { text, updatedAt: new Date() },
        });
    }
    return true;
  } catch (error) {
    Sentry.captureException(error);
    return false;
  }
}
