import * as Sentry from "@sentry/nextjs";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WindowCount } from "./rate-limit";

vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
// Drizzle's eq() builds a piece of SQL. Here it hands back the value instead,
// so the stand-in database below can see which host a query is about.
vi.mock("drizzle-orm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("drizzle-orm")>()),
  eq: (_column: unknown, value: unknown) => value,
}));

// A stand-in for Postgres, with just what rate-limit-store.ts uses: one row
// per host, a lock on that row from `select ... for update` until the
// transaction ends, `set local lock_timeout`, and `statementMs` for every
// statement, like a round trip to Supabase. It also counts the transactions
// opened and the ones still open.
type Row = { host: string; windows: WindowCount[]; cooldownUntil: Date | null };
const rows = new Map<string, Row>();
const locks = new Map<string, Promise<void>>();
let statementMs = 0;
let transactions = 0;
let open = 0;
let failWith: Error | undefined;
// Make the next transaction hang forever, like one whose connection died,
// either before it locks the row or right after.
let hangBeforeLock = false;
let hangAfterLock = false;

const forever = () => new Promise<never>(() => {});

function roundTrip() {
  return new Promise((resolve) => setTimeout(resolve, statementMs));
}

async function transaction<T>(body: (tx: unknown) => Promise<T>): Promise<T> {
  transactions++;
  open++;
  if (hangBeforeLock) {
    hangBeforeLock = false;
    return forever();
  }
  let unlock = () => {};
  let lockTimeoutMs: number | undefined;
  const tx = {
    execute: async (query: SQL) => {
      await roundTrip();
      const setting = /^set local lock_timeout = (\d+)$/.exec(new PgDialect().sqlToQuery(query).sql);
      if (setting) lockTimeoutMs = Number(setting[1]);
    },
    insert: () => ({
      values: ({ host }: { host: string }) => ({
        onConflictDoNothing: async () => {
          await roundTrip();
          if (!rows.has(host)) rows.set(host, { host, windows: [], cooldownUntil: null });
        },
      }),
    }),
    select: () => ({
      from: () => ({
        where: (host: string) => ({
          for: async () => {
            // Wait for whoever holds the row, then hold it until this
            // transaction ends. Postgres gives up after lock_timeout.
            const before = locks.get(host) ?? Promise.resolve();
            const held = new Promise<void>((resolve) => (unlock = resolve));
            locks.set(host, before.then(() => held));
            await Promise.race([
              before,
              lockTimeoutMs === undefined
                ? forever()
                : new Promise((_, reject) =>
                    setTimeout(() => reject(new Error("canceling statement due to lock timeout")), lockTimeoutMs),
                  ),
            ]);
            await roundTrip();
            if (hangAfterLock) {
              hangAfterLock = false;
              return forever();
            }
            return [structuredClone(rows.get(host)!)];
          },
        }),
      }),
    }),
    update: () => ({
      set: (values: Partial<Row>) => ({
        where: async (host: string) => {
          await roundTrip();
          Object.assign(rows.get(host)!, values);
        },
      }),
    }),
  };
  try {
    await roundTrip(); // begin
    if (failWith) throw failWith;
    return await body(tx);
  } finally {
    await roundTrip(); // commit or rollback
    unlock();
    open--;
  }
}

vi.mock("@/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db")>()),
  getDb: () => ({ transaction }),
}));

// A fresh copy of the module for each test, so a check one test leaves
// running can't hold up the next.
let waitTimeFor: typeof import("./rate-limit-store").waitTimeFor;

// Starts `count` checks on one host at once, the way a page that loads a
// player's games starts its Riot calls.
function burst(count: number, host = "americas") {
  return Promise.all(Array.from({ length: count }, () => waitTimeFor(host)));
}

// Moves the clock on by `ms` and returns what `promise` answered by then.
async function answeredWithin<T>(promise: Promise<T>, ms: number): Promise<T | "still waiting"> {
  let answer: T | "still waiting" = "still waiting";
  void promise.then((value) => (answer = value));
  await vi.advanceTimersByTimeAsync(ms);
  return answer;
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubEnv("DATABASE_URL", "postgres://test");
  vi.resetModules();
  ({ waitTimeFor } = await import("./rate-limit-store"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.mocked(Sentry.captureException).mockClear();
  rows.clear();
  locks.clear();
  statementMs = 0;
  transactions = 0;
  open = 0;
  failWith = undefined;
  hangBeforeLock = false;
  hangAfterLock = false;
});

describe("waitTimeFor", () => {
  it("counts a burst of 20 requests in one transaction and answers every one in time", async () => {
    // At 20 ms a statement, 20 transactions queued behind one locked row take
    // over a second, which is what Sentry TURNPOINT-6 caught in production.
    statementMs = 20;
    expect(await answeredWithin(burst(20), 999)).toEqual(Array(20).fill(0));
    expect(rows.get("americas")?.windows.map((w) => w.count)).toEqual([20, 20]);
    expect(transactions).toBe(1);
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("tells requests past the per-second limit to come back when that second ends", async () => {
    statementMs = 10;
    const asked = Array.from({ length: 25 }, () =>
      waitTimeFor("americas").then((wait) => ({ wait, goesAt: Date.now() + wait })),
    );
    const answers = await answeredWithin(Promise.all(asked), 999);
    if (answers === "still waiting") throw new Error("no answer within a second");

    expect(answers.slice(0, 20).map((a) => a.wait)).toEqual(Array(20).fill(0));
    // None goes before the full second ends, and none waits long after it.
    const [second] = rows.get("americas")!.windows;
    const secondEnds = second.start + 1_000;
    for (const late of answers.slice(20)) {
      expect(late.goesAt).toBeGreaterThanOrEqual(secondEnds);
      expect(late.goesAt).toBeLessThan(secondEnds + 100);
    }
    expect(rows.get("americas")?.windows.map((w) => w.count)).toEqual([20, 20]);
  });

  it("tells every request to wait out a cooldown, without counting any", async () => {
    statementMs = 10;
    rows.set("americas", { host: "americas", windows: [], cooldownUntil: new Date(Date.now() + 5_000) });
    const waits = await answeredWithin(burst(3), 999);
    if (waits === "still waiting") throw new Error("no answer within a second");

    for (const wait of waits) {
      expect(wait).toBeGreaterThan(4_000);
      expect(wait).toBeLessThanOrEqual(5_000);
    }
    expect(rows.get("americas")?.windows).toEqual([]);
  });

  it("lets requests go after a second when the database is slow, still counts them, and reports the batch once", async () => {
    statementMs = 2_000;
    expect(await answeredWithin(burst(10), 1_000)).toEqual(Array(10).fill(0));
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error), {
      tags: { host: "americas" },
      extra: { requests: 10 },
    });

    await vi.runAllTimersAsync();
    expect(rows.get("americas")?.windows.map((w) => w.count)).toEqual([10, 10]);
    expect(transactions).toBe(1);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it("reports requests that ran out of time behind a check, even when no check took a second", async () => {
    // A check here takes 6 statements of 130 ms: under a second, but a
    // request that has to wait for the whole of one check and then its own
    // runs out of time.
    statementMs = 130;
    void waitTimeFor("americas");
    await vi.advanceTimersByTimeAsync(10);

    expect(await answeredWithin(burst(5), 1_000)).toEqual(Array(5).fill(0));
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it("reports a database error once for the whole batch and lets the requests go", async () => {
    failWith = new Error("connection refused");
    const answers = burst(10);
    await vi.runAllTimersAsync();

    expect(await answers).toEqual(Array(10).fill(0));
    expect(transactions).toBe(1);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledWith(failWith, expect.anything());
  });

  it("still reports a database error that comes after the requests ran out of time", async () => {
    // The error comes back after 1.2 seconds, once the requests have gone.
    statementMs = 600;
    failWith = new Error("connection reset");
    const answers = burst(3);
    await vi.runAllTimersAsync();

    expect(await answers).toEqual([0, 0, 0]);
    expect(Sentry.captureException).toHaveBeenCalledTimes(2);
    expect(Sentry.captureException).toHaveBeenCalledWith(failWith, expect.anything());
  });

  it("doesn't let a check stuck before locking the row hold up the next ones", async () => {
    statementMs = 1;
    hangBeforeLock = true;
    void waitTimeFor("americas");
    await vi.advanceTimersByTimeAsync(10);

    expect(await answeredWithin(burst(3), 1_100)).toEqual([0, 0, 0]);
    // The stuck check was given up on and reported after a second, and the
    // next one counted all 3.
    expect(rows.get("americas")?.windows[0].count).toBe(3);
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error), {
      tags: { host: "americas" },
      extra: { requests: 1 },
    });
  });

  it("doesn't pile up open transactions behind a check stuck holding the row", async () => {
    statementMs = 1;
    hangAfterLock = true;
    // A request every 200 ms for 6 seconds, all stuck behind the locked row.
    const asked: Promise<number>[] = [];
    for (let t = 0; t < 6_000; t += 200) {
      asked.push(waitTimeFor("americas"));
      await vi.advanceTimersByTimeAsync(200);
    }

    expect(await answeredWithin(Promise.all(asked), 1_000)).toEqual(asked.map(() => 0));
    // The stuck one, plus at most the check waiting for its lock and the one
    // that just gave up. Without the lock timeout, one more stays open each
    // second.
    expect(open).toBeLessThanOrEqual(3);
  });

  it("gives each host its own checks", async () => {
    statementMs = 10;
    const answers = Promise.all([burst(3, "americas"), burst(2, "na1")]);
    await vi.runAllTimersAsync();

    expect(await answers).toEqual([
      [0, 0, 0],
      [0, 0],
    ]);
    expect(rows.get("americas")?.windows[0].count).toBe(3);
    expect(rows.get("na1")?.windows[0].count).toBe(2);
  });

  it("lets every request through without asking when there's no database", async () => {
    vi.stubEnv("DATABASE_URL", "");
    expect(await burst(3)).toEqual([0, 0, 0]);
    expect(transactions).toBe(0);
  });
});
