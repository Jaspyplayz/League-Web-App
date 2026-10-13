import { describe, expect, it } from "vitest";
import { isRegion } from "./regions";

describe("isRegion", () => {
  it("accepts known regions and rejects everything else", () => {
    expect(isRegion("na")).toBe(true);
    expect(isRegion("NA")).toBe(false);
    expect(isRegion("toString")).toBe(false);
  });
});
