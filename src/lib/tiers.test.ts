import { describe, expect, it } from "vitest";
import { isApexTier, isTier, tierName, tierTrack } from "./tiers";

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
