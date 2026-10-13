import { describe, expect, it } from "vitest";
import { isFresh, TTL_MS } from "./freshness";

const now = new Date("2026-10-13T12:00:00Z");
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60 * 1000);

describe("isFresh", () => {
  it("treats never-fetched data as stale", () => {
    expect(isFresh(null, TTL_MS.ranked, now)).toBe(false);
    expect(isFresh(undefined, TTL_MS.ranked, now)).toBe(false);
  });

  it("is fresh inside the TTL", () => {
    expect(isFresh(minutesAgo(14), TTL_MS.ranked, now)).toBe(true);
  });

  it("is stale at and after the TTL", () => {
    expect(isFresh(minutesAgo(15), TTL_MS.ranked, now)).toBe(false);
    expect(isFresh(minutesAgo(60), TTL_MS.ranked, now)).toBe(false);
  });

  it("keeps profiles for a day", () => {
    expect(isFresh(minutesAgo(23 * 60), TTL_MS.profile, now)).toBe(true);
    expect(isFresh(minutesAgo(25 * 60), TTL_MS.profile, now)).toBe(false);
  });
});
