import { describe, expect, it } from "vitest";
import {
  allowance,
  cleanQuestion,
  costMicros,
  gameLabel,
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
  it("counts down the day's questions", () => {
    expect(allowance(0, 0)).toEqual({ ok: true, left: QUESTIONS_PER_DAY });
    expect(allowance(QUESTIONS_PER_DAY - 1, 0)).toEqual({ ok: true, left: 1 });
    expect(allowance(QUESTIONS_PER_DAY, 0).ok).toBe(false);
  });

  it("pauses everyone once the month's budget is spent", () => {
    expect(allowance(0, MONTHLY_BUDGET_USD * 1_000_000).ok).toBe(false);
    expect(allowance(0, MONTHLY_BUDGET_USD * 1_000_000 - 1).ok).toBe(true);
  });
});

describe("gameLabel", () => {
  it("names the champion, result and day", () => {
    expect(
      gameLabel({ champion: "Lee Sin", result: "win", playedAt: "2026-10-18T23:30:00.000Z" }),
    ).toBe("Lee Sin, win, Oct 18");
  });
});
