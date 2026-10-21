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
import { ask, checkAllowance } from "./ask-store";

vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/ask", () => ({ answerQuestion: vi.fn(), ASK_MODEL: "claude-sonnet-5-5" }));

// A pretend database. Each transaction gets its own copy whose steps start
// with "tx1.", "tx2." and so on, so a step run outside a transaction, or in
// a different one, shows up.
// `used` is what the limit checks read; the two arrays are the rows saved in
// ask_questions and ask_spend; `steps` records the order things happen in;
// `reads` which table each limit check read, its filter's SQL and the values
// that filter compared against; `locks` the SQL each lock ran.
type Row = Record<string, unknown>;
let used: { askedToday: number; accountSpent: number; siteSpent: number };
let questions: Row[];
let spend: Row[];
let steps: string[];
let reads: { table: string; counts: boolean; sql: string; params: unknown[] }[];
let locks: string[];
let transactions: number;

const dialect = new PgDialect();
const tableName = (table: unknown) => (table === tables.askSpend ? "ask_spend" : "ask_questions");
const rowsOf = (table: unknown) => (table === tables.askSpend ? spend : questions);
// The values a filter compares against, like the id in `where id = $1`.
const paramsOf = (filter: SQL) => dialect.sqlToQuery(filter).params;
const sqlOf = (filter: SQL) => dialect.sqlToQuery(filter).sql;

function fake(prefix: string) {
  return {
    transaction: async (run: (tx: object) => unknown): Promise<unknown> =>
      run(fake(`tx${++transactions}.`)),
    execute: async (query: SQL) => {
      steps.push(`${prefix}lock`);
      locks.push(sqlOf(query));
    },
    select: (fields: Row) => ({
      from: (table: unknown) => ({
        where: async (filter: SQL) => {
          steps.push(`${prefix}check`);
          reads.push({
            table: tableName(table),
            counts: "n" in fields,
            sql: sqlOf(filter),
            params: paramsOf(filter),
          });
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
  transactions = 0;
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
      return {
        answer: "You die early.",
        games: [{ matchId: "NA1_1", label: "Lee Sin, win, Oct 18" }],
        // Anthropic handed it to a fallback model.
        model: "claude-opus-5-5",
        costMicros: 120_000,
      };
    });

    const outcome = await ask("na", account, "Why do I lose?", "user-1");

    // The lock, the limit checks and the saves are one transaction, so a
    // second question waits until this one is saved before it checks. The
    // two updates after Claude are a second one.
    expect(steps).toEqual([
      ...["tx1.lock", "tx1.check", "tx1.check", "tx1.check", "tx1.save", "tx1.save"],
      "claude",
      ...["tx2.update", "tx2.update"],
    ]);
    // One lock for the whole site, which waits its turn.
    expect(locks).toEqual(["select pg_advisory_xact_lock(hashtext('ask-budget'))"]);
    expect(questions).toMatchObject([
      {
        answer: "You die early.",
        games: [{ matchId: "NA1_1" }],
        model: "claude-opus-5-5",
        costMicros: 120_000,
      },
    ]);
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
    // Every question since the cutoff counts, answered or not, including
    // ones still being answered.
    const sinceForAccount =
      '("ask_questions"."user_id" = $1 and "ask_questions"."created_at" >= $2)';
    expect(reads).toEqual(
      expect.arrayContaining([
        { table: "ask_questions", counts: true, sql: sinceForAccount, params: ["user-1", dayAgo] },
        {
          table: "ask_questions",
          counts: false,
          sql: sinceForAccount,
          params: ["user-1", monthStart],
        },
        // The site's total is everyone's, so it isn't filtered by account.
        {
          table: "ask_spend",
          counts: false,
          sql: '"ask_spend"."created_at" >= $1',
          params: [monthStart],
        },
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
    expect(outcome).toEqual({
      status: "failed",
      message: "Couldn't finish answering. Try again in a moment.",
      left: QUESTIONS_PER_DAY - 1,
    });
  });

  it("doesn't count a question Anthropic turned down on its first round", async () => {
    claudeReturns({ costMicros: 0, error: new Error("overloaded") });

    const outcome = await ask("na", account, "Why do I lose?", "user-1");

    expect(questions).toEqual([]);
    expect(spend).toEqual([]);
    // Both rows go in one transaction, so neither is left without the other.
    expect(steps.slice(-3)).toEqual(["claude", "tx2.delete", "tx2.delete"]);
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

  it("tells the box none are left once an answer uses up the account's month", async () => {
    used.accountSpent = ACCOUNT_MONTHLY_BUDGET_USD * 1_000_000 - 100_000;
    claudeReturns({ answer: "You die early.", costMicros: 150_000 });

    const outcome = await ask("na", account, "Why do I lose?", "user-1");

    expect(outcome).toMatchObject({ status: "answered", left: 0 });
  });

  it("tells the box none are left once an answer uses up the site's month", async () => {
    used.siteSpent = MONTHLY_BUDGET_USD * 1_000_000 - 100_000;
    claudeReturns({ answer: "You die early.", costMicros: 150_000 });

    const outcome = await ask("na", account, "Why do I lose?", "user-1");

    expect(outcome).toMatchObject({ status: "answered", left: 0 });
  });

  // 20 cents of the month left: the 15 cents this answer cost fits, though
  // the 50-cent estimate wouldn't have.
  it("counts what the answer cost, not the estimate, toward the box's count", async () => {
    used.accountSpent = ACCOUNT_MONTHLY_BUDGET_USD * 1_000_000 - 200_000;
    claudeReturns({ answer: "You die early.", costMicros: 150_000 });

    const outcome = await ask("na", account, "Why do I lose?", "user-1");

    expect(outcome).toMatchObject({ status: "answered", left: QUESTIONS_PER_DAY - 1 });
  });

  it("still counts the question when something fails after it was saved", async () => {
    used.askedToday = 9;
    vi.mocked(answerQuestion).mockRejectedValue(new Error("database blip"));

    const outcome = await ask("na", account, "Why do I lose?", "user-1");

    expect(questions).toMatchObject([{ costMicros: HOLD_MICROS }]);
    expect(outcome).toEqual({
      status: "failed",
      message: "Couldn't answer right now. Try again in a moment.",
      left: 0,
    });
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

describe("checkAllowance", () => {
  it("tells the Ask tab how many questions are left", async () => {
    used.askedToday = 3;

    expect(await checkAllowance("user-1")).toEqual({ ok: true, left: QUESTIONS_PER_DAY - 3 });
    expect(reads.map((r) => r.params[0])).toContain("user-1");
  });

  it("tells the Ask tab once the account has spent its share", async () => {
    used.accountSpent = ACCOUNT_MONTHLY_BUDGET_USD * 1_000_000;

    expect(await checkAllowance("user-1")).toEqual({
      ok: false,
      message: "You've used your Ask allowance for this month. It resets on the 1st.",
    });
  });
});
