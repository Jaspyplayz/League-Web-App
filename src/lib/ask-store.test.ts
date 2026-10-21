import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Sentry from "@sentry/nextjs";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { tables } from "@/db";
import { answerQuestion, type AskResult } from "@/lib/ask";
import {
  ACCOUNT_MONTHLY_BUDGET_USD,
  HOLD_MICROS,
  MONTHLY_BUDGET_USD,
  QUESTIONS_PER_DAY,
} from "@/lib/ask-rules";
import type { Account } from "@/lib/riot/types";
import { ask } from "./ask-store";

vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/ask", () => ({ answerQuestion: vi.fn(), ASK_MODEL: "claude-sonnet-5-5" }));

// A pretend database. Inside a transaction it hands out a second copy whose
// steps start with "tx.", so a step run outside the transaction shows up.
// `used` is what the limit checks read; the two arrays are the rows saved in
// ask_questions and ask_spend; `steps` records the order things happen in;
// `reads` which table each limit check read and the values its filter
// compared against; `locks` the SQL each lock ran.
type Row = Record<string, unknown>;
let used: { askedToday: number; accountSpent: number; siteSpent: number };
let questions: Row[];
let spend: Row[];
let steps: string[];
let reads: { table: string; counts: boolean; params: unknown[] }[];
let locks: string[];

const dialect = new PgDialect();
const tableName = (table: unknown) => (table === tables.askSpend ? "ask_spend" : "ask_questions");
const rowsOf = (table: unknown) => (table === tables.askSpend ? spend : questions);
// The values a filter compares against, like the id in `where id = $1`.
const paramsOf = (filter: SQL) => dialect.sqlToQuery(filter).params;

function fake(prefix: string) {
  return {
    transaction: async (run: (tx: object) => unknown): Promise<unknown> => run(fake("tx.")),
    execute: async (query: SQL) => {
      steps.push(`${prefix}lock`);
      locks.push(dialect.sqlToQuery(query).sql);
    },
    select: (fields: Row) => ({
      from: (table: unknown) => ({
        where: async (filter: SQL) => {
          steps.push(`${prefix}check`);
          reads.push({ table: tableName(table), counts: "n" in fields, params: paramsOf(filter) });
          if ("n" in fields) return [{ n: used.askedToday }];
          // Postgres returns sums as text.
          const spent = table === tables.askSpend ? used.siteSpent : used.accountSpent;
          return [{ spent: String(spent) }];
        },
      }),
    }),
    insert: (table: unknown) => ({
      values: (row: Row) => ({
        returning: async () => {
          steps.push(`${prefix}save`);
          // Each table numbers its own ids, so mixing up the two rows shows.
          const id = `${tableName(table)}-${rowsOf(table).length + 1}`;
          const saved = { ...row, id, askedAt: new Date() };
          rowsOf(table).push(saved);
          return [saved];
        },
      }),
    }),
    // These only touch the rows whose id the filter names.
    update: (table: unknown) => ({
      set: (changes: Row) => ({
        where: async (filter: SQL) => {
          steps.push(`${prefix}update`);
          const ids = paramsOf(filter);
          for (const row of rowsOf(table)) if (ids.includes(row.id)) Object.assign(row, changes);
        },
      }),
    }),
    delete: (table: unknown) => ({
      where: async (filter: SQL) => {
        steps.push(`${prefix}delete`);
        const ids = paramsOf(filter);
        const kept = rowsOf(table).filter((row) => !ids.includes(row.id));
        rowsOf(table).splice(0, rowsOf(table).length, ...kept);
      },
    }),
  };
}
const fakeDb = fake("");
vi.mock("@/lib/match-store", () => ({
  database: () => fakeDb,
  readCache: (read: (db: typeof fakeDb) => unknown) => read(fakeDb),
}));

const account = { puuid: "player-1", gameName: "Jaspy", tagLine: "CA1" } as Account;

function claudeReturns(result: Partial<AskResult>) {
  vi.mocked(answerQuestion).mockImplementation(async () => {
    steps.push("claude");
    return { answer: null, games: [], model: "claude-sonnet-5-5", costMicros: 0, ...result };
  });
}

beforeEach(() => {
  used = { askedToday: 0, accountSpent: 0, siteSpent: 0 };
  questions = [];
  spend = [];
  steps = [];
  reads = [];
  locks = [];
  vi.mocked(answerQuestion).mockReset();
  vi.mocked(Sentry.captureException).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ask", () => {
  it("saves the question with an estimated cost before Claude is called", async () => {
    vi.mocked(answerQuestion).mockImplementation(async () => {
      // While Claude answers, the question already counts.
      expect(questions).toMatchObject([{ answer: null, costMicros: HOLD_MICROS }]);
      expect(spend).toMatchObject([{ costMicros: HOLD_MICROS }]);
      steps.push("claude");
      return { answer: "You die early.", games: [], model: "claude-sonnet-5-5", costMicros: 120_000 };
    });

    const outcome = await ask("na", account, "Why do I lose?", "user-1");

    // The lock comes before the limit checks, in the same transaction, so
    // a second question waits until this one is saved before it counts.
    expect(steps).toEqual([
      ...["tx.lock", "tx.check", "tx.check", "tx.check", "tx.save", "tx.save"],
      "claude",
      ...["tx.update", "tx.update"],
    ]);
    // One lock for the whole site, which waits its turn.
    expect(locks).toEqual(["select pg_advisory_xact_lock(hashtext('ask-budget'))"]);
    expect(questions).toMatchObject([{ answer: "You die early.", costMicros: 120_000 }]);
    expect(spend).toEqual([expect.objectContaining({ costMicros: 120_000 })]);
    // The budget's copy of the cost has no account or question in it.
    expect(Object.keys(spend[0])).not.toContain("userId");
    expect(outcome).toMatchObject({ status: "answered", left: QUESTIONS_PER_DAY - 1 });
  });

  it("turns the question away without calling Claude once the account has spent its share", async () => {
    used.accountSpent = ACCOUNT_MONTHLY_BUDGET_USD * 1_000_000;

    const outcome = await ask("na", account, "Why do I lose?", "user-1");

    expect(answerQuestion).not.toHaveBeenCalled();
    expect(questions).toEqual([]);
    expect(outcome).toEqual({
      status: "failed",
      message: "You've used your Ask allowance for this month. It resets on the 1st.",
      left: 0,
    });
  });

  it("pauses everyone once ask_spend reaches the month's budget", async () => {
    // No questions left in ask_questions, as if their accounts were deleted:
    // their cost still counts.
    used.siteSpent = MONTHLY_BUDGET_USD * 1_000_000;

    const outcome = await ask("na", account, "Why do I lose?", "user-1");

    expect(answerQuestion).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({
      status: "failed",
      message: "Ask has used this month's budget and is paused until the 1st.",
    });
  });

  it("counts this account's last 24 hours, its month, and the whole site's month", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-21T12:00:00Z"));
    claudeReturns({ answer: "You die early.", costMicros: 120_000 });

    await ask("na", account, "Why do I lose?", "user-1");

    const dayAgo = "2026-10-20T12:00:00.000Z";
    const monthStart = "2026-10-01T00:00:00.000Z";
    expect(reads).toEqual(
      expect.arrayContaining([
        { table: "ask_questions", counts: true, params: ["user-1", dayAgo] },
        { table: "ask_questions", counts: false, params: ["user-1", monthStart] },
        // The site's total is everyone's, so it isn't filtered by account.
        { table: "ask_spend", counts: false, params: [monthStart] },
      ]),
    );
    expect(reads).toHaveLength(3);
  });

  it("charges what the finished rounds cost when a later round fails", async () => {
    const overloaded = new Error("overloaded");
    claudeReturns({ costMicros: 30_000, error: overloaded });

    const outcome = await ask("na", account, "Why do I lose?", "user-1");

    expect(questions).toMatchObject([{ answer: null, costMicros: 30_000 }]);
    expect(spend).toMatchObject([{ costMicros: 30_000 }]);
    expect(Sentry.captureException).toHaveBeenCalledWith(overloaded);
    expect(outcome).toMatchObject({ status: "failed", left: QUESTIONS_PER_DAY - 1 });
  });

  it("doesn't count a question Anthropic turned down on its first round", async () => {
    claudeReturns({ costMicros: 0, error: new Error("overloaded") });

    const outcome = await ask("na", account, "Why do I lose?", "user-1");

    expect(questions).toEqual([]);
    expect(spend).toEqual([]);
    expect(outcome).toEqual({
      status: "failed",
      message: "Couldn't answer right now. Try again in a moment.",
      left: QUESTIONS_PER_DAY,
    });
  });

  it("keeps the estimate when a try timed out before Claude's first reply", async () => {
    claudeReturns({ costMicros: HOLD_MICROS, error: new Error("timed out") });

    const outcome = await ask("na", account, "Why do I lose?", "user-1");

    expect(questions).toMatchObject([{ answer: null, costMicros: HOLD_MICROS }]);
    expect(spend).toMatchObject([{ costMicros: HOLD_MICROS }]);
    expect(outcome).toMatchObject({ status: "failed", left: QUESTIONS_PER_DAY - 1 });
  });

  it("tells the box a question Claude couldn't answer still counted", async () => {
    used.askedToday = 7;
    claudeReturns({ answer: null, costMicros: 50_000 });

    const outcome = await ask("na", account, "Why do I lose?", "user-1");

    expect(outcome).toEqual({
      status: "failed",
      message: "Couldn't answer that one. Try asking it another way.",
      left: QUESTIONS_PER_DAY - 8,
    });
  });
});
