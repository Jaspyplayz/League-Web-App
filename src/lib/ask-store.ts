import "server-only";

import * as Sentry from "@sentry/nextjs";
import { and, count, desc, eq, gte, isNotNull, sum } from "drizzle-orm";
import { tables } from "@/db";
import { answerQuestion } from "@/lib/ask";
import { allowance, monthStart, type Allowance, type AskGame } from "@/lib/ask-rules";
import { database, readCache } from "@/lib/match-store";
import type { Region } from "@/lib/regions";
import type { Account } from "@/lib/riot/types";

// Reads and writes the Ask tab's questions in the ask_questions table (see
// src/db/schema.ts), and checks the limits in src/lib/ask-rules.ts.

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

// One account's answered questions about one player, newest first.
export async function readQuestions(userId: string, puuid: string): Promise<AskedQuestion[]> {
  const rows = await readCache((db) =>
    db
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
      .limit(HISTORY_LENGTH),
  );
  return (rows ?? []).map((r) => ({ ...r, answer: r.answer ?? "" }));
}

// Whether this account can ask now, and how many questions it has left today.
export async function checkAllowance(userId: string): Promise<Allowance> {
  const db = database();
  if (!db) return { ok: false, message: "Ask isn't available right now." };
  const [[today], [month]] = await Promise.all([
    db
      .select({ n: count() })
      .from(tables.askQuestions)
      .where(
        and(
          eq(tables.askQuestions.userId, userId),
          gte(tables.askQuestions.createdAt, new Date(Date.now() - DAY_MS)),
        ),
      ),
    // Everyone's questions this month, for the site-wide budget.
    db
      .select({ spent: sum(tables.askQuestions.costMicros) })
      .from(tables.askQuestions)
      .where(gte(tables.askQuestions.createdAt, monthStart(new Date()))),
  ]);
  // Postgres returns sums as text, and null when there are no rows.
  return allowance(today.n, Number(month.spent ?? 0));
}

export type AskOutcome =
  | { status: "answered"; question: AskedQuestion; left: number }
  | { status: "failed"; message: string };

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

  try {
    const allowed = await checkAllowance(userId);
    if (!allowed.ok) return { status: "failed", message: allowed.message };

    const result = await answerQuestion(region, account, question);
    const [row] = await db
      .insert(tables.askQuestions)
      .values({
        userId,
        puuid: account.puuid,
        question,
        answer: result.answer,
        games: result.games,
        model: result.model,
        costMicros: result.costMicros,
      })
      .returning({ id: tables.askQuestions.id, askedAt: tables.askQuestions.createdAt });

    if (result.answer === null) {
      return { status: "failed", message: "Couldn't answer that one. Try asking it another way." };
    }
    return {
      status: "answered",
      question: { ...row, question, answer: result.answer, games: result.games },
      left: allowed.left - 1,
    };
  } catch (error) {
    Sentry.captureException(error);
    return { status: "failed", message: "Couldn't answer right now. Try again in a moment." };
  }
}
