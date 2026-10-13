import { describe, expect, it } from "vitest";
import { accountRegional, isRegion } from "./regions";

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
