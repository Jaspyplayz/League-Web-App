import { beforeEach, describe, expect, it, vi } from "vitest";
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

// A pretend database. `used` is what the limit checks read; the two arrays
// are the rows ask() has saved in ask_questions and ask_spend; `steps`
// records the order things happen in, and `reads` which table each limit
// check read and the values its filter compared against.
type Row = Record<string, unknown>;
let used: { askedToday: number; accountSpent: number; siteSpent: number };
let questions: Row[];
let spend: Row[];
let steps: string[];
let reads: { table: string; params: unknown[] }[];

const dialect = new PgDialect();
const rowsOf = (table: unknown) => (table === tables.askSpend ? spend : questions);
const fakeDb = {
  // A transaction runs its steps on the same pretend database.
  transaction: async (run: (tx: object) => unknown) => run(fakeDb),
  execute: async () => {
    steps.push("lock");
  },
  select: (fields: Row) => ({
    from: (table: unknown) => ({
      where: async (filter: SQL) => {
        steps.push("check");
        const name = table === tables.askSpend ? "ask_spend" : "ask_questions";
        reads.push({ table: name, params: dialect.sqlToQuery(filter).params });
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
        steps.push("save");
        const saved = { ...row, id: `row-${rowsOf(table).length + 1}`, askedAt: new Date() };
        rowsOf(table).push(saved);
        return [saved];
      },
    }),
  }),
  // Each test saves one row per table, so these change that row.
  update: (table: unknown) => ({
    set: (changes: Row) => ({
      where: async () => {
        Object.assign(rowsOf(table)[0], changes);
      },
    }),
  }),
  delete: (table: unknown) => ({
    where: async () => {
      rowsOf(table).length = 0;
    },
  }),
};
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
  vi.mocked(answerQuestion).mockReset();
  vi.mocked(Sentry.captureException).mockReset();
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

    // The lock comes before the limit checks, so a second question waits
    // until this one is saved before it counts.
    expect(steps).toEqual(["lock", "check", "check", "check", "save", "save", "claude"]);
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

  it("counts only this account's questions toward its day and its month", async () => {
    claudeReturns({ answer: "You die early.", costMicros: 120_000 });

    await ask("na", account, "Why do I lose?", "user-1");

    const accountReads = reads.filter((r) => r.table === "ask_questions");
    expect(accountReads).toHaveLength(2);
    for (const read of accountReads) expect(read.params).toContain("user-1");
    // The site's total is everyone's, so it isn't filtered by account.
    expect(reads.filter((r) => r.table === "ask_spend")).toHaveLength(1);
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

  it("doesn't count a question that failed before Claude's first reply", async () => {
    claudeReturns({ costMicros: 0, error: new Error("network") });

    const outcome = await ask("na", account, "Why do I lose?", "user-1");

    expect(questions).toEqual([]);
    expect(spend).toEqual([]);
    expect(outcome).toEqual({
      status: "failed",
      message: "Couldn't answer right now. Try again in a moment.",
      left: QUESTIONS_PER_DAY,
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
