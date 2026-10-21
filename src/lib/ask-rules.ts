// The rules around the Ask tab that don't need the network: how long a
// question can be, how many one account can ask, what an answer cost and
// how much one account and the whole site may spend a month. Kept apart from src/lib/ask.ts
// (the Claude call) so they're easy to unit test.

// Questions one account can ask in 24 hours. Jasper picked 10 (2026-10-20).
export const QUESTIONS_PER_DAY = 10;

// The most the whole site spends on Ask in a calendar month, in dollars. Once
// the month's answers add up to this, the tab pauses until the 1st, so
// Turnpoint's API credit can't run out. A question usually costs 5 to 20
// cents, so this is a few hundred questions a month.
export const MONTHLY_BUDGET_USD = 20;

// The most one account can spend on Ask in a calendar month, in dollars, so
// one person (or a few free accounts) can't use up the whole site's budget
// and pause Ask for everyone. Jasper picked $5 (2026-10-21): a quarter of
// the budget, which is 25 to 100 questions at the usual price.
export const ACCOUNT_MONTHLY_BUDGET_USD = 5;

// What a question counts as while Claude is still answering it, in
// millionths of a dollar: 50 cents, well above the usual 5 to 20. The
// question is saved with this before Claude is called, so questions sent at
// the same moment each see the ones before them, and swapped for what it
// cost once the answer is in. If the server is stopped mid-answer, the
// estimate stays, which is usually more than the question cost by then.
// The same 50 cents is also added to a question's cost for a round with a
// try that may have been billed without a reply, like one that timed out
// (see sendRound in src/lib/ask.ts), so a question can cost more than this.
export const HOLD_MICROS = 500_000;

export const MAX_QUESTION_LENGTH = 300;

// A game Claude read to answer, shown as a link under the answer.
// `label` is like "Lee Sin, win, Oct 18".
export type AskGame = { matchId: string; label: string };

export type CleanQuestion = { ok: true; text: string } | { ok: false; message: string };

// Trims the question and squeezes runs of spaces and line breaks into one.
export function cleanQuestion(raw: string): CleanQuestion {
  const text = raw.replace(/\s+/g, " ").trim();
  if (text === "") return { ok: false, message: "Type a question first." };
  if (text.length > MAX_QUESTION_LENGTH) {
    return { ok: false, message: `Questions can be up to ${MAX_QUESTION_LENGTH} characters.` };
  }
  return { ok: true, text };
}

// Dollars per million tokens, from Anthropic's price list (checked
// 2026-10-20). A dollar per million tokens is a millionth of a dollar per
// token, so tokens × price gives the cost in millionths of a dollar.
// "Cache write" is what saving the start of the conversation for the next
// round costs (1.25 × input); "cache read" is reusing it (a tenth of input).
type Price = { input: number; output: number; cacheWrite: number; cacheRead: number };

const PRICES: Record<string, Price> = {
  "claude-sonnet-5-5": { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
  "claude-opus-5-5": { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
};

// If Claude declines a question, Anthropic can hand it to a fallback model
// (see src/lib/ask.ts). Any model not listed above is priced like the most
// expensive one it could be, so the budget errs on the safe side.
const UNKNOWN_MODEL_PRICE: Price = { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 };

// The token counts Anthropic reports with each response.
export type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

// What one response cost, in millionths of a dollar, rounded up.
export function costMicros(model: string, usage: Usage): number {
  const price = PRICES[model] ?? UNKNOWN_MODEL_PRICE;
  return Math.ceil(
    usage.input_tokens * price.input +
      usage.output_tokens * price.output +
      (usage.cache_creation_input_tokens ?? 0) * price.cacheWrite +
      (usage.cache_read_input_tokens ?? 0) * price.cacheRead,
  );
}

// Midnight UTC on the 1st of the month `now` is in: the monthly budget
// counts answers from here.
export function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export type Allowance = { ok: true; left: number } | { ok: false; message: string };

// What this account and the whole site have used so far: `askedToday` is
// the account's questions in the last 24 hours; the two spends are this
// calendar month's, in millionths of a dollar.
export type UsedSoFar = { askedToday: number; accountSpent: number; siteSpent: number };

// Whether this account may ask another question right now.
export function allowance({ askedToday, accountSpent, siteSpent }: UsedSoFar): Allowance {
  if (siteSpent >= MONTHLY_BUDGET_USD * 1_000_000) {
    return {
      ok: false,
      message: "Ask has used this month's budget and is paused until the 1st.",
    };
  }
  if (accountSpent >= ACCOUNT_MONTHLY_BUDGET_USD * 1_000_000) {
    return {
      ok: false,
      message: "You've used your Ask allowance for this month. It resets on the 1st.",
    };
  }
  if (askedToday >= QUESTIONS_PER_DAY) {
    return {
      ok: false,
      message: `You've asked ${QUESTIONS_PER_DAY} questions today. Try again tomorrow.`,
    };
  }
  return { ok: true, left: QUESTIONS_PER_DAY - askedToday };
}

// How many questions the account has left after one more that cost
// `costMicros`, for the count under the box: 0 once that question used up
// the day, the account's month or the site's month.
export function leftAfter(used: UsedSoFar, costMicros: number): number {
  const after = allowance({
    askedToday: used.askedToday + 1,
    accountSpent: used.accountSpent + costMicros,
    siteSpent: used.siteSpent + costMicros,
  });
  return after.ok ? after.left : 0;
}

// The label under an answer for one game from recent_games:
// "Lee Sin, win, Oct 18". The date is in UTC, since the server doesn't know
// the reader's timezone; it's only there to tell games apart.
export function gameLabel(game: { champion: string; result: string; playedAt: string }): string {
  const date = new Date(game.playedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  return `${game.champion}, ${game.result}, ${date}`;
}
