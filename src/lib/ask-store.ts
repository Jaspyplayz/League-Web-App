import "server-only";

import * as Sentry from "@sentry/nextjs";
import { and, count, desc, eq, gte, isNotNull, sql, sum } from "drizzle-orm";
import { tables, type Db } from "@/db";
import { answerQuestion, ASK_MODEL, type AskResult } from "@/lib/ask";
import {
  allowance,
  HOLD_MICROS,
  leftAfter,
  monthStart,
  type Allowance,
  type AskGame,
  type UsedSoFar,
} from "@/lib/ask-rules";
import { database } from "@/lib/match-store";
import { readOwnData } from "@/lib/own-data";
import type { Region } from "@/lib/regions";
import type { Account } from "@/lib/riot/types";

// Reads and writes the Ask tab's questions in the ask_questions table and
// what they cost in ask_spend (see src/db/schema.ts), and checks the limits
// in src/lib/ask-rules.ts.
//
// A question is saved before Claude is called, not after. Claude takes up
// to a few minutes to answer, and if the question were only saved at the
// end, several sent at the same moment would all pass the check while none
// of them was counted yet. So: check the limits and save the question with
// an estimated cost (reserve), call Claude, then swap in the answer and what
// it cost (settle).

const DAY_MS = 24 * 60 * 60 * 1000;
// Past questions shown on the tab, newest first.
const HISTORY_LENGTH = 10;

export type AskedQuestion = {
  id: string;
  question: string;
  answer: string;
  games: AskGame[];
  askedAt: Date;
};

// One account's answered questions about one player, newest first. A failed
// read says so, so the Ask tab doesn't show an empty history as if nothing
// was asked (#167).
export type ReadQuestionsResult = { ok: true; questions: AskedQuestion[] } | { ok: false };

export async function readQuestions(userId: string, puuid: string): Promise<ReadQuestionsResult> {
  const result = await readOwnData(async (db) => {
    const rows = await db
      .select({
        id: tables.askQuestions.id,
        question: tables.askQuestions.question,
        answer: tables.askQuestions.answer,
        games: tables.askQuestions.games,
        askedAt: tables.askQuestions.createdAt,
      })
      .from(tables.askQuestions)
      .where(
        and(
          eq(tables.askQuestions.userId, userId),
          eq(tables.askQuestions.puuid, puuid),
          isNotNull(tables.askQuestions.answer),
        ),
      )
      .orderBy(desc(tables.askQuestions.createdAt))
      .limit(HISTORY_LENGTH);
    return rows.map((r) => ({ ...r, answer: r.answer ?? "" }));
  }, []);
  return result.ok ? { ok: true, questions: result.value } : result;
}

// Whether this account can ask now, and how many questions it has left today.
export async function checkAllowance(userId: string): Promise<Allowance> {
  const db = database();
  if (!db) return { ok: false, message: "Ask isn't available right now." };
  return allowance(await usedSoFar(db, userId));
}

// What this account asked today and spent this month, and what the whole
// site spent this month. Takes the database or a transaction.
async function usedSoFar(db: Pick<Db, "select">, userId: string): Promise<UsedSoFar> {
  const q = tables.askQuestions;
  const month = monthStart(new Date());
  const [[today], [account], [site]] = await Promise.all([
    db
      .select({ n: count() })
      .from(q)
      .where(and(eq(q.userId, userId), gte(q.createdAt, new Date(Date.now() - DAY_MS)))),
    db
      .select({ spent: sum(q.costMicros) })
      .from(q)
      .where(and(eq(q.userId, userId), gte(q.createdAt, month))),
    // Everyone's questions this month, from ask_spend, which keeps the cost
    // of questions whose account was deleted.
    db
      .select({ spent: sum(tables.askSpend.costMicros) })
      .from(tables.askSpend)
      .where(gte(tables.askSpend.createdAt, month)),
  ]);
  // Postgres returns sums as text, and null when there are no rows.
  return {
    askedToday: today.n,
    accountSpent: Number(account.spent ?? 0),
    siteSpent: Number(site.spent ?? 0),
  };
}

export type AskOutcome =
  | { status: "answered"; question: AskedQuestion; left: number }
  // `left` is set when the server knows how many questions are left now,
  // so the box's count matches what was counted.
  | { status: "failed"; message: string; left?: number };

// A question saved before Claude is called: its rows in both tables, what
// the account and site had used before it, and how many questions that left.
type Hold = {
  questionId: string;
  spendId: string;
  askedAt: Date;
  used: UsedSoFar;
  left: number;
};

// Asks Claude one question about one player and saves the answer. The
// question is the only thing taken from the browser: the games are read
// again here from Riot and the database.
export async function ask(
  region: Region,
  account: Account,
  question: string,
  userId: string,
): Promise<AskOutcome> {
  const db = database();
  if (!db) return { status: "failed", message: "Ask isn't available right now." };

  // Set once the question is saved, so a failure after that can still say
  // how many questions are left.
  let saved: Hold | undefined;
  try {
    const reserved = await reserve(db, userId, account.puuid, question);
    if (!reserved.ok) return { status: "failed", message: reserved.message, left: 0 };
    const { hold } = reserved;
    saved = hold;

    const result = await answerQuestion(region, account, question);
    if (result.error !== undefined) Sentry.captureException(result.error);

    // Anthropic turned down both tries of the first round (overloaded,
    // rate limited), so nothing was spent: take the question back, and it
    // doesn't count toward the day. A try that timed out isn't free (see
    // sendRound in src/lib/ask.ts), so then the cost isn't 0.
    if (result.error !== undefined && result.costMicros === 0) {
      await release(db, hold);
      return {
        status: "failed",
        message: "Couldn't answer right now. Try again in a moment.",
        left: hold.left,
      };
    }

    await settle(db, hold, result);
    // From the numbers read before Claude was called, so a question sent at
    // the same time from another tab isn't in it; a reload shows the exact
    // count.
    const left = leftAfter(hold.used, result.costMicros);
    if (result.answer === null) {
      const message =
        result.error === undefined
          ? "Couldn't answer that one. Try asking it another way."
          : "Couldn't finish answering. Try again in a moment.";
      return { status: "failed", message, left };
    }
    return {
      status: "answered",
      question: {
        id: hold.questionId,
        question,
        answer: result.answer,
        games: result.games,
        askedAt: hold.askedAt,
      },
      left,
    };
  } catch (error) {
    // Most likely the database. If the question was already saved, it
    // still counts, at its 50-cent estimate. That's usually more than the
    // question cost, but not always (see costMicros in AskResult,
    // src/lib/ask.ts).
    Sentry.captureException(error);
    return {
      status: "failed",
      message: "Couldn't answer right now. Try again in a moment.",
      left: saved ? leftAfter(saved.used, HOLD_MICROS) : undefined,
    };
  }
}

// Checks the limits and saves the question with HOLD_MICROS as its cost, in
// one transaction. The transaction first takes a lock the whole site shares
// (an "advisory lock": Postgres locks a number we pick, here one made from
// the name "ask-budget"), so two questions sent at the same moment take
// turns: the second one's check sees the first one's row and estimate. One
// lock for everyone, not one per account, because the monthly budget is
// shared too. It's let go when the transaction ends, before Claude is
// called, so each question holds it for milliseconds, not minutes.
async function reserve(
  db: Db,
  userId: string,
  puuid: string,
  question: string,
): Promise<{ ok: true; hold: Hold } | { ok: false; message: string }> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('ask-budget'))`);
    const used = await usedSoFar(tx, userId);
    const allowed = allowance(used);
    if (!allowed.ok) return allowed;

    const [row] = await tx
      .insert(tables.askQuestions)
      .values({
        userId,
        puuid,
        question,
        answer: null,
        games: [],
        model: ASK_MODEL,
        costMicros: HOLD_MICROS,
      })
      .returning({ id: tables.askQuestions.id, askedAt: tables.askQuestions.createdAt });
    const [spend] = await tx
      .insert(tables.askSpend)
      .values({ costMicros: HOLD_MICROS })
      .returning({ id: tables.askSpend.id });
    return {
      ok: true,
      hold: {
        questionId: row.id,
        spendId: spend.id,
        askedAt: row.askedAt,
        used,
        left: allowed.left,
      },
    };
  });
}

// Swaps the estimate for Claude's answer and what it cost (see costMicros
// in AskResult, src/lib/ask.ts).
async function settle(db: Db, hold: Hold, result: AskResult): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(tables.askQuestions)
      .set({
        answer: result.answer,
        games: result.games,
        model: result.model,
        costMicros: result.costMicros,
      })
      .where(eq(tables.askQuestions.id, hold.questionId));
    await tx
      .update(tables.askSpend)
      .set({ costMicros: result.costMicros })
      .where(eq(tables.askSpend.id, hold.spendId));
  });
}

// Deletes a saved question that cost nothing.
async function release(db: Db, hold: Hold): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(tables.askQuestions).where(eq(tables.askQuestions.id, hold.questionId));
    await tx.delete(tables.askSpend).where(eq(tables.askSpend.id, hold.spendId));
  });
}
