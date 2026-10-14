import { describe, expect, it } from "vitest";
import { isApexTier, isTier, tierName } from "./tiers";

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
