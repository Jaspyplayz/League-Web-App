import { describe, expect, it } from "vitest";
import { hasMoreGames, matchListHref, readGameCount } from "./more-games";
import { QUEUE_FILTERS, readQueueFilter } from "./queue-filters";

describe("readGameCount", () => {
  it("reads a multiple of 10 up to 50", () => {
    expect(readGameCount("20")).toBe(20);
    expect(readGameCount("50")).toBe(50);
  });

  it("falls back to 10 for anything else", () => {
    expect(readGameCount(undefined)).toBe(10);
    expect(readGameCount("abc")).toBe(10);
    expect(readGameCount("15")).toBe(10);
    expect(readGameCount("60")).toBe(10);
    expect(readGameCount("0")).toBe(10);
    expect(readGameCount(["20", "30"])).toBe(10);
  });
});

describe("hasMoreGames", () => {
  it("offers more after a full list", () => {
    expect(hasMoreGames(20, 20)).toBe(true);
  });

  it("stops when Riot ran out of games", () => {
    expect(hasMoreGames(14, 20)).toBe(false);
  });

  it("stops at 50 games", () => {
    expect(hasMoreGames(50, 50)).toBe(false);
  });
});

describe("matchListHref", () => {
  const all = QUEUE_FILTERS[0];

  it("leaves the URL bare for the first 10 games", () => {
    expect(matchListHref("/player/na/Jaspy-CA1", all, 10)).toBe(
      "/player/na/Jaspy-CA1#matches-heading",
    );
  });

  it("keeps the game-mode tab and jumps to the first new row", () => {
    expect(matchListHref("/player/na/Jaspy-CA1", readQueueFilter("solo"), 20, "game-11")).toBe(
      "/player/na/Jaspy-CA1?queue=solo&games=20#game-11",
    );
  });
});
