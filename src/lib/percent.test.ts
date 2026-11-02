import { describe, expect, it } from "vitest";
import { formatPercent, formatPercentTenths } from "./percent";

describe("formatPercent", () => {
  it("rounds to whole points", () => {
    expect(formatPercent(0.6143)).toBe("61%");
    expect(formatPercent(0.615)).toBe("62%");
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(1)).toBe("100%");
  });
});

describe("formatPercentTenths", () => {
  it("keeps one decimal, even when it's a zero", () => {
    expect(formatPercentTenths(0.5234)).toBe("52.3%");
    expect(formatPercentTenths(0.5)).toBe("50.0%");
    expect(formatPercentTenths(1)).toBe("100.0%");
  });
});
