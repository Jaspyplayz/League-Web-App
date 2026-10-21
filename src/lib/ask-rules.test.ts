import { describe, expect, it } from "vitest";
import {
  ACCOUNT_MONTHLY_BUDGET_USD,
  allowance,
  cleanQuestion,
  costMicros,
  gameLabel,
  HOLD_MICROS,
  MAX_QUESTION_LENGTH,
  MONTHLY_BUDGET_USD,
  monthStart,
  QUESTIONS_PER_DAY,
} from "./ask-rules";

describe("cleanQuestion", () => {
  it("trims and squeezes spaces", () => {
    expect(cleanQuestion("  Why do I lose\n\non Viego?  ")).toEqual({
      ok: true,
      text: "Why do I lose on Viego?",
    });
  });

  it("refuses empty and too-long questions", () => {
    expect(cleanQuestion("   ").ok).toBe(false);
    expect(cleanQuestion("a".repeat(MAX_QUESTION_LENGTH + 1)).ok).toBe(false);
    expect(cleanQuestion("a".repeat(MAX_QUESTION_LENGTH)).ok).toBe(true);
  });
});

describe("costMicros", () => {
  it("prices each kind of token", () => {
    // 10,000 new input tokens at $2 per million = 2 cents = 20,000 millionths.
    // 1,000 output at $10 per million = 1 cent. 50,000 cache reads at $0.20 = 1 cent.
    // 4,000 cache writes at $2.50 = 1 cent.
    expect(
      costMicros("claude-sonnet-5-5", {
        input_tokens: 10_000,
        output_tokens: 1_000,
        cache_read_input_tokens: 50_000,
        cache_creation_input_tokens: 4_000,
      }),
    ).toBe(50_000);
  });

  it("prices an unknown model at least as high as the dearest known one", () => {
    const usage = { input_tokens: 1_000, output_tokens: 1_000 };
    expect(costMicros("some-new-model", usage)).toBeGreaterThan(
      costMicros("claude-opus-5-5", usage),
    );
  });
});

describe("monthStart", () => {
  it("is midnight UTC on the 1st", () => {
    expect(monthStart(new Date("2026-10-20T02:40:00Z")).toISOString()).toBe(
      "2026-10-01T00:00:00.000Z",
    );
  });
});

describe("allowance", () => {
  const none = { askedToday: 0, accountSpent: 0, siteSpent: 0 };
  const dollars = (usd: number) => usd * 1_000_000;

  it("counts down the day's questions", () => {
    expect(allowance(none)).toEqual({ ok: true, left: QUESTIONS_PER_DAY });
    expect(allowance({ ...none, askedToday: QUESTIONS_PER_DAY - 1 })).toEqual({ ok: true, left: 1 });
    expect(allowance({ ...none, askedToday: QUESTIONS_PER_DAY }).ok).toBe(false);
  });

  it("pauses everyone once the month's budget is spent", () => {
    expect(allowance({ ...none, siteSpent: dollars(MONTHLY_BUDGET_USD) }).ok).toBe(false);
    expect(allowance({ ...none, siteSpent: dollars(MONTHLY_BUDGET_USD) - 1 }).ok).toBe(true);
  });

  it("stops one account once it has spent its share of the month", () => {
    const spent = allowance({ ...none, accountSpent: dollars(ACCOUNT_MONTHLY_BUDGET_USD) });
    expect(spent).toEqual({
      ok: false,
      message: "You've used your Ask allowance for this month. It resets on the 1st.",
    });
    expect(allowance({ ...none, accountSpent: dollars(ACCOUNT_MONTHLY_BUDGET_USD) - 1 }).ok).toBe(
      true,
    );
  });

  it("leaves room for other accounts after one reaches its share", () => {
    expect(ACCOUNT_MONTHLY_BUDGET_USD).toBeLessThan(MONTHLY_BUDGET_USD);
  });

  it("names the limit that lasts longest when several are reached", () => {
    const all = {
      askedToday: QUESTIONS_PER_DAY,
      accountSpent: dollars(ACCOUNT_MONTHLY_BUDGET_USD),
      siteSpent: dollars(MONTHLY_BUDGET_USD),
    };
    expect(allowance(all)).toMatchObject({ message: expect.stringContaining("paused") });
    // "Try again tomorrow" would be wrong: tomorrow the month is still used up.
    expect(allowance({ ...all, siteSpent: 0 })).toMatchObject({
      message: expect.stringContaining("this month"),
    });
  });
});

describe("HOLD_MICROS", () => {
  // The estimate a question counts as until its cost is in. Questions sent
  // at the same moment are each checked against the ones before them at
  // this estimate, so the further a question's cost can go past it, the
  // further a burst of them can go past the caps. It has to be well above
  // what a question usually costs (5 to 20 cents).
  it("is well above the usual cost of a question", () => {
    expect(HOLD_MICROS).toBeGreaterThanOrEqual(200_000);
  });
});

describe("gameLabel", () => {
  it("names the champion, result and day", () => {
    expect(
      gameLabel({ champion: "Lee Sin", result: "win", playedAt: "2026-10-18T23:30:00.000Z" }),
    ).toBe("Lee Sin, win, Oct 18");
  });
});
