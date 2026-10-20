import "server-only";

import * as Sentry from "@sentry/nextjs";
import { eq, sql } from "drizzle-orm";
import { getDb, tables } from "@/db";
import { takeTurn, type HostState } from "./rate-limit";

// Keeps the count of Riot requests in Postgres, so every copy of the app on
// Vercel shares one count per Riot host instead of each guessing on its own.
//
// Like the match cache, this is an extra, not a requirement: without a
// database (a fresh local checkout, or the database is down) every request is
// let through, and Riot's own "too many requests" answer still stops us.

// A turn should cost a few milliseconds. If the database takes longer than
// this, skip the check rather than make the page wait.
const DB_TIMEOUT_MS = 1_000;

const limits = tables.riotRateLimits;

// Asks for permission to send one request to `host`. Returns 0 when the
// request may go now (and counts it), or how many milliseconds to wait.
export async function waitTimeFor(host: string): Promise<number> {
  if (!process.env.DATABASE_URL) return 0;
  try {
    return await withTimeout(
      getDb().transaction(async (tx) => {
        // Make sure the host has a row, then lock it. Two servers asking at
        // the same moment take turns here, so they can't both use the last
        // request left in a window.
        await tx.insert(limits).values({ host }).onConflictDoNothing();
        const [row] = await tx.select().from(limits).where(eq(limits.host, host)).for("update");

        const state: HostState = {
          windows: row.windows,
          cooldownUntil: row.cooldownUntil?.getTime() ?? 0,
        };
        const turn = takeTurn(state, Date.now());
        if (!turn.allowed) return turn.waitMs;

        await tx.update(limits).set({ windows: turn.next.windows }).where(eq(limits.host, host));
        return 0;
      }),
    );
  } catch (error) {
    Sentry.captureException(error);
    return 0;
  }
}

// Tells every server to leave `host` alone until `until`, after Riot said
// "too many requests". Keeps the later time if one is already saved.
export async function saveCooldown(host: string, until: Date): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    await withTimeout(
      getDb()
        .insert(limits)
        .values({ host, cooldownUntil: until })
        .onConflictDoUpdate({
          target: limits.host,
          set: { cooldownUntil: sql`greatest(${limits.cooldownUntil}, excluded.cooldown_until)` },
        }),
    );
  } catch (error) {
    Sentry.captureException(error);
  }
}

function withTimeout<T>(promise: PromiseLike<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Rate limit check took over ${DB_TIMEOUT_MS} ms`)),
      DB_TIMEOUT_MS,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
