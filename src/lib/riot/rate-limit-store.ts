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

// A turn should cost a few milliseconds. If a request's answer hasn't come
// back after this long, the request goes ahead rather than make the page wait.
const DB_TIMEOUT_MS = 1_000;

const limits = tables.riotRateLimits;

// A page that loads a player's games can start 15 or more Riot calls at once.
// With one transaction each, they all queued behind the same locked row, the
// last ones passed DB_TIMEOUT_MS and went to Riot without waiting their turn,
// and Riot answered "too many requests" (Sentry TURNPOINT-6). So each server
// runs one check per host at a time, and that check takes a turn for every
// request that asked while the one before it ran: a batch.
type Batch = {
  answers: ((waitMs: number) => void)[];
  // Set once a request in the batch has run out of time, so that's reported
  // once, not once for every request in it.
  timedOut: boolean;
};
const nextBatch = new Map<string, Batch>();
const checking = new Set<string>();

// Asks for permission to send one request to `host`. Returns 0 when the
// request may go now (and counts it), or how many milliseconds to wait.
export async function waitTimeFor(host: string): Promise<number> {
  if (!process.env.DATABASE_URL) return 0;
  const batch = nextBatch.get(host) ?? { answers: [], timedOut: false };
  nextBatch.set(host, batch);
  const answer = new Promise<number>((resolve) => batch.answers.push(resolve));
  if (!checking.has(host)) void checkUntilNobodyWaits(host);
  // This request may first wait for the check ahead of its own, so it gets
  // its own time limit, and past it the request goes ahead. Its check's time
  // limit can't end sooner, so this is where a slow check is reported.
  return withTimeout(answer).catch((error: unknown) => {
    if (!batch.timedOut) {
      Sentry.captureException(error, { tags: { host }, extra: { requests: batch.answers.length } });
    }
    batch.timedOut = true;
    return 0;
  });
}

async function checkUntilNobodyWaits(host: string) {
  checking.add(host);
  try {
    // Let calls started together, like the Riot calls a page starts in
    // parallel, join the first batch instead of queueing behind a batch of one.
    await Promise.resolve();
    for (let batch = nextBatch.get(host); batch; batch = nextBatch.get(host)) {
      nextBatch.delete(host);
      // Past the time limit every request in this batch has already gone
      // ahead, so the next check starts and this one finishes on its own.
      const answers = batch.answers;
      const waits = await withTimeout(takeTurns(host, answers.length)).catch(() => answers.map(() => 0));
      answers.forEach((answer, i) => answer(waits[i]));
    }
  } finally {
    checking.delete(host);
  }
}

// Takes `count` turns on `host` in one transaction, in order, and returns
// each one's wait: 0 to go now, or milliseconds to wait. If the database
// fails, every request goes ahead, and the error is reported even when the
// check was already given up on, since it says why.
async function takeTurns(host: string, count: number): Promise<number[]> {
  try {
    return await getDb().transaction(async (tx) => {
      // A check that was given up on can still hold the row, if its
      // connection died after locking it. Wait for that lock no longer than a
      // request waits, then give the connection back, so stuck checks can't
      // fill the pool and hold up the page's other queries.
      await tx.execute(sql.raw(`set local lock_timeout = ${DB_TIMEOUT_MS}`));
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
      const waits: number[] = [];
      for (let i = 0; i < count; i++) {
        const turn = takeTurn(state, now);
        if (turn.allowed) state = turn.next;
        waits.push(turn.allowed ? 0 : turn.waitMs);
      }

      if (waits.includes(0)) {
        await tx.update(limits).set({ windows: state.windows }).where(eq(limits.host, host));
      }
      return waits;
    });
  } catch (error) {
    Sentry.captureException(error, { tags: { host }, extra: { requests: count } });
    return Array<number>(count).fill(0);
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
