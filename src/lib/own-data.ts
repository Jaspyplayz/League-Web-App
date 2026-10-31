import "server-only";

import * as Sentry from "@sentry/nextjs";
import type { Db } from "@/db";
import { database } from "@/lib/match-store";

// Reads data a signed-in player made: their notes, their "This is me" mark,
// their Ask history. Unlike readCache, a failed read isn't the same as
// nothing saved, so it says so, and the page never offers an action that
// would overwrite what it couldn't read (#167, decision record 0020).
//
// Without DATABASE_URL these features are off, so `off` comes back as
// nothing saved. A DATABASE_URL that gives no usable database, or a query
// that throws, is a failure.
export type OwnDataResult<T> = { ok: true; value: T } | { ok: false };

export async function readOwnData<T>(read: (db: Db) => Promise<T>, off: T): Promise<OwnDataResult<T>> {
  const db = database();
  if (!db) return process.env.DATABASE_URL ? { ok: false } : { ok: true, value: off };
  try {
    return { ok: true, value: await read(db) };
  } catch (error) {
    Sentry.captureException(error);
    return { ok: false };
  }
}
