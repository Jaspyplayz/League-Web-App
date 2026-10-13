import { describe, expect, it } from "vitest";
import { buildDiffChart, formatDiff, insertZeroCrossings } from "./diff-chart";

const box = { width: 100, height: 100, left: 0, right: 0, top: 0, bottom: 0 };

describe("buildDiffChart", () => {
  it("rounds the range out to whole ticks and keeps zero inside it", () => {
    const chart = buildDiffChart(
      [
        { minute: 0, diff: 0 },
        { minute: 10, diff: 650 },
        { minute: 20, diff: -2900 },
      ],
      box,
    );
    expect(chart.yTicks).toEqual([1000, 0, -1000, -2000, -3000]);
    expect(chart.y(1000)).toBe(0);
    expect(chart.y(-3000)).toBe(100);
    expect(chart.zeroY).toBe(25);
  });

  it("spans the first to last minute across the full width", () => {
    const chart = buildDiffChart(
      [
        { minute: 0, diff: 0 },
        { minute: 31, diff: 100 },
      ],
      box,
    );
    expect(chart.x(0)).toBe(0);
    expect(chart.x(31)).toBe(100);
    expect(chart.xTicks).toEqual([0, 10, 20, 30]);
  });

  it("still shows both sides when a player was never behind", () => {
    const chart = buildDiffChart(
      [
        { minute: 0, diff: 0 },
        { minute: 5, diff: 300 },
      ],
      box,
    );
    expect(chart.yTicks.at(-1)).toBeLessThan(0);
  });

  it("needs at least two points", () => {
    expect(() => buildDiffChart([{ minute: 0, diff: 0 }], box)).toThrow();
  });
});

describe("insertZeroCrossings", () => {
  it("adds a zero point where the line changes sign", () => {
    expect(
      insertZeroCrossings([
        { minute: 0, diff: 100 },
        { minute: 1, diff: -300 },
      ]),
    ).toEqual([
      { minute: 0, diff: 100 },
      { minute: 0.25, diff: 0 },
      { minute: 1, diff: -300 },
    ]);
  });

  it("leaves lines that touch zero without crossing alone", () => {
    const pts = [
      { minute: 0, diff: 0 },
      { minute: 1, diff: 200 },
      { minute: 2, diff: 0 },
    ];
    expect(insertZeroCrossings(pts)).toEqual(pts);
  });
});

describe("formatDiff", () => {
  it.each([
    [0, "0"],
    [1000, "+1k"],
    [-2000, "−2k"],
    [1500, "+1.5k"],
    [-500, "−500"],
  ])("formats %d as %s", (value, text) => {
    expect(formatDiff(value)).toBe(text);
  });
});
