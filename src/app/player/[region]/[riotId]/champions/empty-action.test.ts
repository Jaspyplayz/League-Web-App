import { describe, expect, it } from "vitest";
import { emptyAction } from "./empty-action";

describe("the Champions empty panel's way forward", () => {
  it("loads more games while some of the season is missing", () => {
    expect(emptyAction("solo", false)).toBe("load-more");
    expect(emptyAction("all", false)).toBe("load-more");
  });

  it("offers every mode once the season is in", () => {
    expect(emptyAction("solo", true)).toBe("every-mode");
  });

  it("offers nothing when every mode is already showing", () => {
    expect(emptyAction("all", true)).toBeNull();
  });
});
