import { describe, expect, it } from "vitest";
import { isApexTier, isTier, rankScore, scoreLabel, tierName, tierTrack } from "./tiers";

describe("tiers", () => {
  it("recognizes Riot's tier names", () => {
    expect(isTier("EMERALD")).toBe(true);
    expect(isTier("emerald")).toBe(false);
    expect(isTier("WOOD")).toBe(false);
  });

  it("knows which tiers have no divisions", () => {
    expect(isApexTier("GRANDMASTER")).toBe(true);
    expect(isApexTier("DIAMOND")).toBe(false);
  });

  it("names tiers for the page", () => {
    expect(tierName("GRANDMASTER")).toBe("Grandmaster");
    expect(tierName("IRON")).toBe("Iron");
  });
});

describe("tierTrack", () => {
  it("shows the four divisions and the next tier, marking where the player is", () => {
    expect(tierTrack("DIAMOND", "II")).toEqual([
      { label: "D4", state: "done" },
      { label: "D3", state: "done" },
      { label: "D2", state: "current" },
      { label: "D1", state: "next" },
      { label: "M", state: "next" },
    ]);
  });

  it("points a non-apex tier at the next tier's lowest division", () => {
    expect(tierTrack("GOLD", "IV")?.map((s) => s.label)).toEqual(["G4", "G3", "G2", "G1", "P4"]);
    expect(tierTrack("GOLD", "IV")?.[0].state).toBe("current");
  });

  it("has no track for Master and above, or for data it doesn't recognize", () => {
    expect(tierTrack("MASTER", "I")).toBeNull();
    expect(tierTrack("CHALLENGER", "I")).toBeNull();
    expect(tierTrack("WOOD", "IV")).toBeNull();
    expect(tierTrack("GOLD", "V")).toBeNull();
  });
});

describe("rankScore", () => {
  it("puts every rank on one scale", () => {
    expect(rankScore("IRON", "IV", 0)).toBe(0);
    expect(rankScore("IRON", "I", 50)).toBe(350);
    expect(rankScore("DIAMOND", "I", 75)).toBe(2775);
    expect(rankScore("MASTER", "I", 0)).toBe(2800);
    expect(rankScore("CHALLENGER", "I", 1200)).toBe(4000);
  });

  it("gives null for data it doesn't recognize", () => {
    expect(rankScore("WOOD", "IV", 0)).toBeNull();
    expect(rankScore("GOLD", "V", 0)).toBeNull();
  });
});

describe("scoreLabel", () => {
  it("names the division a score starts", () => {
    expect(scoreLabel(0)).toBe("I4");
    expect(scoreLabel(2700)).toBe("D1");
    expect(scoreLabel(2400)).toBe("D4");
    expect(scoreLabel(2800)).toBe("M");
    expect(scoreLabel(3500)).toBe("M");
  });
});
