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

// A page that loads a player's games can start 15 or more Riot calls at once.
// With one transaction each, they all queued behind the same locked row, the
// last ones passed DB_TIMEOUT_MS and went to Riot without waiting their turn,
// and Riot answered "too many requests" (Sentry TURNPOINT-6). So each server
// runs one check per host at a time, and that check takes a turn for everyone
// who asked while the one before it ran.
const waiting = new Map<string, ((waitMs: number) => void)[]>();
const checking = new Set<string>();

// Asks for permission to send one request to `host`. Returns 0 when the
// request may go now (and counts it), or how many milliseconds to wait.
export async function waitTimeFor(host: string): Promise<number> {
  if (!process.env.DATABASE_URL) return 0;
  const answer = new Promise<number>((resolve) => {
    const callers = waiting.get(host) ?? [];
    callers.push(resolve);
    waiting.set(host, callers);
  });
  if (!checking.has(host)) void checkUntilNobodyWaits(host);
  // This caller may first wait for the check ahead of its own, so it gets its
  // own time limit. Past it the request goes ahead, and its check still
  // counts it when it finishes, as long as the window has room.
  return withTimeout(answer).catch(() => 0);
}

async function checkUntilNobodyWaits(host: string) {
  checking.add(host);
  try {
    for (let callers = waiting.get(host); callers; callers = waiting.get(host)) {
      waiting.delete(host);
      // Past the time limit the next check starts anyway, so one stuck on a
      // dead connection can't hold the host up; this one finishes on its own.
      // A slow or failed check is reported once, not once per caller.
      const waits = await withTimeout(takeTurns(host, callers.length)).catch((error: unknown) => {
        Sentry.captureException(error);
        return callers.map(() => 0);
      });
      callers.forEach((resolve, i) => resolve(waits[i]));
    }
  } finally {
    checking.delete(host);
  }
}

// Takes `count` turns on `host` in one transaction, in order, and returns
// each one's wait: 0 to go now, or milliseconds to wait.
async function takeTurns(host: string, count: number): Promise<number[]> {
  return getDb().transaction(async (tx) => {
    // Make sure the host has a row, then lock it. Two servers asking at
    // the same moment take turns here, so they can't both use the last
    // request left in a window.
    await tx.insert(limits).values({ host }).onConflictDoNothing();
    const [row] = await tx.select().from(limits).where(eq(limits.host, host)).for("update");

    let state: HostState = {
      windows: row.windows,
      cooldownUntil: row.cooldownUntil?.getTime() ?? 0,
    };
    const now = Date.now();
    const waits = Array.from({ length: count }, () => {
      const turn = takeTurn(state, now);
      if (!turn.allowed) return turn.waitMs;
      state = turn.next;
      return 0;
    });

    if (waits.includes(0)) {
      await tx.update(limits).set({ windows: state.windows }).where(eq(limits.host, host));
    }
    return waits;
  });
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
