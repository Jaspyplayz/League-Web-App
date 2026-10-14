import { describe, expect, it } from "vitest";
import { isFresh, secondsUntilUpdate, TTL_MS } from "./freshness";

const now = new Date("2026-10-13T12:00:00Z");
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60 * 1000);

describe("isFresh", () => {
  it("treats never-fetched data as stale", () => {
    expect(isFresh(null, TTL_MS.profile, now)).toBe(false);
    expect(isFresh(undefined, TTL_MS.profile, now)).toBe(false);
  });

  it("is fresh inside the TTL", () => {
    expect(isFresh(minutesAgo(1), TTL_MS.updateCooldown, now)).toBe(true);
  });

  it("is stale at and after the TTL", () => {
    expect(isFresh(minutesAgo(2), TTL_MS.updateCooldown, now)).toBe(false);
    expect(isFresh(minutesAgo(60), TTL_MS.updateCooldown, now)).toBe(false);
  });

  it("keeps profiles for a day", () => {
    expect(isFresh(minutesAgo(23 * 60), TTL_MS.profile, now)).toBe(true);
    expect(isFresh(minutesAgo(25 * 60), TTL_MS.profile, now)).toBe(false);
  });
});

describe("secondsUntilUpdate", () => {
  it("allows an update when the profile was never fetched", () => {
    expect(secondsUntilUpdate(null, now)).toBe(0);
  });

  it("counts down the two minute cooldown", () => {
    expect(secondsUntilUpdate(now, now)).toBe(120);
    expect(secondsUntilUpdate(new Date(now.getTime() - 90_500), now)).toBe(30);
  });

  it("allows an update once the cooldown is over", () => {
    expect(secondsUntilUpdate(minutesAgo(2), now)).toBe(0);
    expect(secondsUntilUpdate(minutesAgo(60), now)).toBe(0);
  });
});
