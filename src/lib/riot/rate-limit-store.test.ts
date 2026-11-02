import * as Sentry from "@sentry/nextjs";
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
// transaction ends, and `statementMs` for every statement, like a round trip
// to Supabase. It also counts the transactions opened.
type Row = { host: string; windows: WindowCount[]; cooldownUntil: Date | null };
const rows = new Map<string, Row>();
const locks = new Map<string, Promise<void>>();
let statementMs = 0;
let transactions = 0;
let failWith: Error | undefined;
// Makes the next transaction hang forever, like one sent on a dead connection.
let hangNext = false;

function roundTrip() {
  return new Promise((resolve) => setTimeout(resolve, statementMs));
}

async function transaction<T>(body: (tx: unknown) => Promise<T>): Promise<T> {
  transactions++;
  if (hangNext) {
    hangNext = false;
    return new Promise<T>(() => {});
  }
  let unlock = () => {};
  const tx = {
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
            // transaction ends.
            const before = locks.get(host) ?? Promise.resolve();
            const held = new Promise<void>((resolve) => (unlock = resolve));
            locks.set(host, before.then(() => held));
            await before;
            await roundTrip();
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
    await roundTrip(); // commit
    unlock();
  }
}

vi.mock("@/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db")>()),
  getDb: () => ({ transaction }),
}));

const { waitTimeFor } = await import("./rate-limit-store");

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

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("DATABASE_URL", "postgres://test");
});

afterEach(async () => {
  // Let every check still running finish, so none carries into the next test.
  await vi.runAllTimersAsync();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.mocked(Sentry.captureException).mockClear();
  rows.clear();
  locks.clear();
  statementMs = 0;
  transactions = 0;
  failWith = undefined;
  hangNext = false;
});

describe("waitTimeFor", () => {
  it("counts a burst of 20 requests in two transactions and answers every one in time", async () => {
    // At 20 ms a statement, 20 transactions queued behind one locked row take
    // over a second, which is what Sentry TURNPOINT-6 caught in production.
    statementMs = 20;
    expect(await answeredWithin(burst(20), 999)).toEqual(Array(20).fill(0));
    expect(rows.get("americas")?.windows.map((w) => w.count)).toEqual([20, 20]);
    expect(transactions).toBe(2);
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

  it("lets requests go after a second when the database is slow, still counts them, and reports each slow check once", async () => {
    statementMs = 2_000;
    expect(await answeredWithin(burst(10), 1_000)).toEqual(Array(10).fill(0));
    // The first request had a check to itself; the other 9 share the next.
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);

    // The two checks finish seconds apart, so the 2-minute window is the one
    // that holds all 10.
    await vi.runAllTimersAsync();
    expect(rows.get("americas")?.windows[1].count).toBe(10);
    expect(transactions).toBe(2);
    expect(Sentry.captureException).toHaveBeenCalledTimes(2);
  });

  it("reports a database error once for the whole batch and lets the requests go", async () => {
    failWith = new Error("connection refused");
    const answers = burst(10);
    await vi.runAllTimersAsync();

    expect(await answers).toEqual(Array(10).fill(0));
    expect(transactions).toBe(2);
    expect(Sentry.captureException).toHaveBeenCalledTimes(2);
    expect(Sentry.captureException).toHaveBeenCalledWith(failWith);
  });

  it("doesn't let a check stuck on a dead connection hold up the next ones", async () => {
    statementMs = 1;
    hangNext = true;
    void waitTimeFor("americas");
    await vi.advanceTimersByTimeAsync(10);

    expect(await answeredWithin(burst(3), 1_000)).toEqual([0, 0, 0]);
    // The stuck check was given up on after a second, and the next one
    // counted all 3.
    expect(rows.get("americas")?.windows[0].count).toBe(3);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
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
