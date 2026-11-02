import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Sentry from "@sentry/nextjs";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { tables } from "@/db";
import { loadMatch } from "@/lib/match-store";
import { writeRecap } from "@/lib/recap";
import { createRecap, RECAPS_PER_DAY } from "./recap-store";

vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/match-facts", () => ({ loadMatchFacts: async () => ({ result: "win" }) }));
vi.mock("@/lib/recap", () => ({ RECAP_MODEL: "claude-haiku-5-5", writeRecap: vi.fn() }));

// A pretend database. Each transaction gets its own copy whose steps start
// with "tx1.", "tx2." and so on, so a step run outside a transaction shows up.
// `earlier` is how many tries the account made before this test; `tries` and
// `recaps` are the rows saved during it; `steps` records the order things
// happen in; `counts` and `locks` the SQL each count and lock ran, with the
// values it compared against.
type Row = Record<string, unknown>;
let earlier: number;
let tries: Row[];
let recaps: Row[];
let saved: { headline: string; detail: string } | undefined;
let steps: string[];
let counts: { sql: string; params: unknown[] }[];
let locks: { sql: string; params: unknown[] }[];
let transactions: number;

const dialect = new PgDialect();
const query = (q: SQL) => {
  const { sql, params } = dialect.sqlToQuery(q);
  return { sql, params };
};

function fake(prefix: string) {
  return {
    transaction: async (run: (tx: object) => unknown): Promise<unknown> =>
      run(fake(`tx${++transactions}.`)),
    execute: async (q: SQL) => {
      steps.push(`${prefix}lock`);
      locks.push(query(q));
    },
    select: () => ({
      from: () => ({
        where: async (filter: SQL) => {
          steps.push(`${prefix}count`);
          counts.push(query(filter));
          return [{ n: earlier + tries.length }];
        },
      }),
    }),
    insert: (table: unknown) => ({
      values: (row: Row) => {
        const isRecap = table === tables.matchRecaps;
        const save = () => {
          steps.push(`${prefix}${isRecap ? "save recap" : "save try"}`);
          (isRecap ? recaps : tries).push(row);
        };
        return {
          onConflictDoNothing: async () => save(),
          then: (resolve: () => void, reject: (e: unknown) => void) =>
            Promise.resolve().then(save).then(resolve, reject),
        };
      },
    }),
  };
}
const fakeDb = fake("");
vi.mock("@/lib/match-store", () => ({
  database: () => fakeDb,
  readCache: async () => saved,
  loadMatch: vi.fn(),
}));

const USER = "user-1";
const written = { headline: "You won.", detail: "Overall\tYou won." };

function claudeReturns(result: typeof written | null | Error) {
  vi.mocked(writeRecap).mockImplementation(async () => {
    steps.push("claude");
    if (result instanceof Error) throw result;
    return result;
  });
}

beforeEach(() => {
  earlier = 0;
  tries = [];
  recaps = [];
  saved = undefined;
  steps = [];
  counts = [];
  locks = [];
  transactions = 0;
  vi.mocked(writeRecap).mockReset();
  vi.mocked(Sentry.captureException).mockReset();
  vi.mocked(loadMatch).mockImplementation(async () => {
    steps.push("riot");
    return { metadata: { matchId: "NA1_1" } } as Awaited<ReturnType<typeof loadMatch>>;
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createRecap", () => {
  it("saves the try before Riot or Claude is called", async () => {
    claudeReturns(written);

    const result = await createRecap("na", "NA1_1", "player-1", USER);

    // The lock, the count and the try are one transaction, so a second try
    // sent at the same moment waits until this one is saved before it counts.
    expect(steps).toEqual(["tx1.lock", "tx1.count", "tx1.save try", "riot", "claude", "save recap"]);
    // One lock per account: another account's tries don't wait for it.
    expect(locks).toEqual([
      {
        sql: "select pg_advisory_xact_lock(hashtext('recap-tries'), hashtext($1))",
        params: [USER],
      },
    ]);
    expect(tries).toEqual([{ userId: USER }]);
    expect(result).toEqual({ status: "written", recap: written });
  });

  it("counts this account's tries in the last 24 hours", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-21T12:00:00Z"));
    claudeReturns(written);

    await createRecap("na", "NA1_1", "player-1", USER);

    expect(counts).toEqual([
      {
        sql: '("recap_tries"."user_id" = $1 and "recap_tries"."created_at" >= $2)',
        params: [USER, "2026-10-20T12:00:00.000Z"],
      },
    ]);
  });

  it("turns the try away without calling Riot or Claude once the account has used the day's tries", async () => {
    earlier = RECAPS_PER_DAY;

    const result = await createRecap("na", "NA1_1", "player-1", USER);

    expect(steps).not.toContain("riot");
    expect(writeRecap).not.toHaveBeenCalled();
    expect(tries).toEqual([]);
    expect(result).toEqual({
      status: "failed",
      message: `You've asked for ${RECAPS_PER_DAY} recaps today. Try again tomorrow.`,
    });
  });

  it("lets the last try of the day through", async () => {
    earlier = RECAPS_PER_DAY - 1;
    claudeReturns(written);

    expect(await createRecap("na", "NA1_1", "player-1", USER)).toMatchObject({ status: "written" });
  });

  it("still counts a try Claude couldn't write a recap for", async () => {
    earlier = RECAPS_PER_DAY - 1;
    claudeReturns(null);

    const result = await createRecap("na", "NA1_1", "player-1", USER);
    const next = await createRecap("na", "NA1_2", "player-1", USER);

    expect(result).toEqual({ status: "failed", message: "Couldn't write a recap for this game." });
    expect(next).toMatchObject({ message: expect.stringContaining("Try again tomorrow") });
    expect(writeRecap).toHaveBeenCalledTimes(1);
  });

  it("still counts a try whose Claude call failed", async () => {
    const overloaded = new Error("overloaded");
    claudeReturns(overloaded);

    const result = await createRecap("na", "NA1_1", "player-1", USER);

    expect(tries).toEqual([{ userId: USER }]);
    expect(Sentry.captureException).toHaveBeenCalledWith(overloaded);
    expect(result).toEqual({
      status: "failed",
      message: "Couldn't write the recap. Try again in a moment.",
    });
  });

  it("doesn't count a try for a game whose recap is already saved", async () => {
    saved = written;

    const result = await createRecap("na", "NA1_1", "player-1", USER);

    expect(steps).toEqual([]);
    expect(result).toEqual({ status: "written", recap: written });
  });

  // The cap reads recap_tries now, so the recap itself doesn't need to say
  // which account asked for it.
  it("saves the recap without the account that asked for it", async () => {
    claudeReturns(written);

    await createRecap("na", "NA1_1", "player-1", USER);

    expect(recaps).toEqual([
      { matchId: "NA1_1", puuid: "player-1", ...written, model: "claude-haiku-5-5" },
    ]);
  });
});
