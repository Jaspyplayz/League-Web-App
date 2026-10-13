import { describe, expect, it } from "vitest";
import { describeDiff } from "./describe";

describe("describeDiff", () => {
  it("names the end, the best and the worst moments", () => {
    const points = [0, 300, 650, -200, -2900].map((diff, minute) => ({ minute, diff }));
    expect(describeDiff(points, "Gold difference against Syndra")).toBe(
      "Gold difference against Syndra by minute. Ended −2,900. " +
        "Biggest lead +650 at minute 2. Furthest behind −2,900 at minute 4.",
    );
  });

  it("skips the lead when you were never ahead", () => {
    const points = [0, -100].map((diff, minute) => ({ minute, diff }));
    expect(describeDiff(points, "CS")).toBe(
      "CS by minute. Ended −100. Furthest behind −100 at minute 1.",
    );
  });
});
