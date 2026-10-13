import { describe, expect, it } from "vitest";
import { formatClock, formatSigned, listNames, plural, times } from "./format";

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
