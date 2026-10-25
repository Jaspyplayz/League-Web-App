import { describe, expect, it } from "vitest";
import {
  formatClock,
  formatGap,
  formatSigned,
  listNames,
  plural,
  roundedGap,
  times,
} from "./format";

describe("formatSigned", () => {
  it.each([
    [1230, "+1,230"],
    [-420, "−420"],
    [0, "0"],
    [0.4, "0"],
  ])("formats %d as %s", (value, text) => {
    expect(formatSigned(value)).toBe(text);
  });
});

describe("formatGap", () => {
  it("says how far ahead or behind you are", () => {
    expect(formatGap(-194, 420)).toEqual({ text: "614 behind", tone: "worse" });
    expect(formatGap(1500, 300)).toEqual({ text: "1,200 ahead", tone: "better" });
  });

  it("keeps the decimals it is asked for", () => {
    expect(formatGap(5.4, 6.3, { decimals: 1 })).toEqual({ text: "0.9 behind", tone: "worse" });
    expect(formatGap(7, 6, { decimals: 1 })).toEqual({ text: "1.0 ahead", tone: "better" });
  });

  it("calls a gap that rounds to nothing even", () => {
    expect(formatGap(5.41, 5.39, { decimals: 1 })).toEqual({ text: "Even", tone: "even" });
    expect(formatGap(10, 10)).toEqual({ text: "Even", tone: "even" });
  });

  it("uses more and fewer when less is better", () => {
    expect(formatGap(0.3, 0.2, { decimals: 1, lowerIsBetter: true })).toEqual({
      text: "0.1 more",
      tone: "worse",
    });
    expect(formatGap(1, 2.5, { decimals: 1, lowerIsBetter: true })).toEqual({
      text: "1.5 fewer",
      tone: "better",
    });
  });
});

describe("formatGap for shares and neutral stats", () => {
  const percent = (v: number) => `${Math.round(v * 100)}%`;

  it("writes the gap with the format it is given", () => {
    expect(formatGap(0.45, 0.57, { decimals: 2, format: percent })).toEqual({
      text: "12% behind",
      tone: "worse",
    });
  });

  it("says more or less without judging neutral stats", () => {
    expect(formatGap(0.6, 0.4, { decimals: 2, format: percent, neutral: true })).toEqual({
      text: "20% more",
      tone: "even",
    });
    expect(formatGap(2, 3, { neutral: true })).toEqual({ text: "1 less", tone: "even" });
  });
});

describe("roundedGap", () => {
  it("rounds the difference before a word is chosen", () => {
    expect(roundedGap(5.41, 5.39, 1)).toBe(0);
    expect(roundedGap(-194, 420)).toBe(-614);
    expect(roundedGap(3, 1, 1)).toBe(2);
  });
});

describe("formatClock", () => {
  it("shows minutes and seconds", () => {
    expect(formatClock(490_000)).toBe("8:10");
    expect(formatClock(65_999)).toBe("1:05");
  });
});

describe("sentence helpers", () => {
  it("counts in words", () => {
    expect(times(1)).toBe("once");
    expect(times(2)).toBe("twice");
    expect(times(4)).toBe("4 times");
    expect(plural(1, "plate")).toBe("1 plate");
    expect(plural(3, "plate")).toBe("3 plates");
  });

  it("joins names like a person would", () => {
    expect(listNames(["Vi"])).toBe("Vi");
    expect(listNames(["Vi", "Ahri"])).toBe("Vi and Ahri");
    expect(listNames(["Vi", "Ahri", "Jinx"])).toBe("Vi, Ahri and Jinx");
  });
});
