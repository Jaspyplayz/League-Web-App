import { describe, expect, it } from "vitest";
import { accountRegional, isMatchIdFor, isRegion } from "./regions";

describe("isRegion", () => {
  it("accepts known regions and rejects everything else", () => {
    expect(isRegion("na")).toBe(true);
    expect(isRegion("NA")).toBe(false);
    expect(isRegion("toString")).toBe(false);
  });
});

describe("accountRegional", () => {
  it("sends OCE account lookups to asia, since sea doesn't serve them", () => {
    expect(accountRegional("oce")).toBe("asia");
    expect(accountRegional("na")).toBe("americas");
  });
});

describe("isMatchIdFor", () => {
  it("accepts match IDs from the region's platform only", () => {
    expect(isMatchIdFor("na", "NA1_5012345678")).toBe(true);
    expect(isMatchIdFor("euw", "NA1_5012345678")).toBe(false);
    expect(isMatchIdFor("na", "NA1_abc")).toBe(false);
    expect(isMatchIdFor("na", "")).toBe(false);
  });
});
