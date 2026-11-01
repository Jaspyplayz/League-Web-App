import { describe, expect, it } from "vitest";
import { evalChance, markSpot, quietLines, startingPlay, stripLeft, stripLine } from "./board";

describe("the play the board opens on", () => {
  it("is the one that moved the chance most, whichever way", () => {
    expect(startingPlay([{ swing: 2 }, { swing: -7.5 }, { swing: 7 }])).toBe(1);
  });

  it("is the earlier one in a tie", () => {
    expect(startingPlay([{ swing: 4 }, { swing: -4 }])).toBe(0);
  });

  it("is none when you were in no plays", () => {
    expect(startingPlay([])).toBe(-1);
  });
});

describe("the eval bar's number", () => {
  const perSecond = [500, 620, 915];

  it("is the chance just after the selected play", () => {
    expect(evalChance({ after: 0.62 }, perSecond)).toBeCloseTo(62);
  });

  it("is the chance at the end of the game with nothing selected", () => {
    expect(evalChance(null, perSecond)).toBeCloseTo(91.5);
  });

  it("is even when the game has no chance at all", () => {
    expect(evalChance(null, [])).toBe(50);
  });
});

describe("the win-chance strip", () => {
  it("draws high chances near the top", () => {
    expect(stripLine([500, 900, 100])).toBe("M0,500L1,100L2,900");
  });

  it("thins out a long game but still reaches its last second", () => {
    const perSecond = Array.from({ length: 1001 }, (_, s) => s % 1000);
    const line = stripLine(perSecond);
    expect(line.split("L").length).toBeLessThanOrEqual(502);
    expect(line.endsWith("L1000,1000")).toBe(true);
  });

  it("puts a minute where the chart would: the last second is the right edge", () => {
    const perSecond = new Array(601).fill(500); // a 10-minute game
    expect(stripLeft(0, perSecond)).toBe(0);
    expect(stripLeft(5, perSecond)).toBe(50);
    expect(stripLeft(10, perSecond)).toBe(100);
    expect(stripLeft(11, perSecond)).toBe(100);
  });

  it("marks a play at its time and the chance it left you with", () => {
    const perSecond = new Array(601).fill(500);
    const spot = markSpot({ minute: 2.5, after: 0.75 }, perSecond);
    expect(spot.left).toBe(25);
    expect(spot.top).toBe(25);
  });
});

describe("the lines for a quiet game", () => {
  const busy = { hasOpponent: true, turningPoints: 2, hasWinChance: true, swings: 3 };

  it("says nothing when there were big moments", () => {
    expect(quietLines(busy)).toEqual([]);
  });

  it("names the 750 gold line when there were no turning points", () => {
    expect(quietLines({ ...busy, turningPoints: 0 })).toEqual([
      "No big swings: the gold difference never moved more than 750 in a few minutes. This one was decided slowly.",
    ]);
  });

  it("says so when no minute moved the win chance", () => {
    expect(quietLines({ ...busy, swings: 0 })).toEqual([
      "No single minute moved the win chance much.",
    ]);
  });

  it("stays quiet about what the game can't have", () => {
    expect(
      quietLines({ hasOpponent: false, turningPoints: 0, hasWinChance: false, swings: 0 }),
    ).toEqual([]);
  });
});
