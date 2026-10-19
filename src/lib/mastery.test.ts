import { describe, expect, it } from "vitest";
import { formatPoints, masteryMarks } from "./mastery";

const base = { championId: 60, championLevel: 36, championPoints: 362587, lastPlayTime: 0 };

describe("masteryMarks", () => {
  it("counts marks earned toward the next level", () => {
    expect(masteryMarks({ ...base, tokensEarned: 1, markRequiredForNextLevel: 2 })).toEqual({
      earned: 1,
      needed: 2,
    });
  });

  it("never shows more earned than needed", () => {
    expect(masteryMarks({ ...base, tokensEarned: 5, markRequiredForNextLevel: 2 })?.earned).toBe(2);
  });

  it("draws no pips when the level needs no marks or Riot leaves them out", () => {
    expect(masteryMarks({ ...base, tokensEarned: 0, markRequiredForNextLevel: 0 })).toBeNull();
    expect(masteryMarks(base)).toBeNull();
  });
});

describe("formatPoints", () => {
  it("adds thousands separators", () => {
    expect(formatPoints(362587)).toBe("362,587");
  });
});
