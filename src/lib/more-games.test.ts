import { describe, expect, it } from "vitest";
import { isPlainProfilePage, listEnd, matchListHref, MAX_GAMES, readGameCount } from "./more-games";
import { QUEUE_FILTERS, readQueueFilter } from "./queue-filters";

describe("readGameCount", () => {
  it("reads a multiple of 10 up to 200", () => {
    expect(readGameCount("20")).toBe(20);
    expect(readGameCount("60")).toBe(60);
    expect(readGameCount("200")).toBe(200);
  });

  it("falls back to 10 for anything else", () => {
    expect(readGameCount(undefined)).toBe(10);
    expect(readGameCount("abc")).toBe(10);
    expect(readGameCount("15")).toBe(10);
    expect(readGameCount("210")).toBe(10);
    expect(readGameCount("0")).toBe(10);
    expect(readGameCount(["20", "30"])).toBe(10);
  });
});

describe("listEnd", () => {
  const now = Date.UTC(2026, 9, 29);
  const daysAgo = (days: number) => now - days * 24 * 60 * 60 * 1000;

  it("offers more while the list is under two months", () => {
    expect(listEnd(50, 50, daysAgo(20), now)).toBe("more");
    expect(listEnd(60, 60, daysAgo(59), now)).toBe("more");
  });

  it("stops once the oldest game shown is over two months old", () => {
    expect(listEnd(120, 120, daysAgo(61), now)).toBe("two-months");
    // Even on the first page, for a player who rarely plays.
    expect(listEnd(10, 10, daysAgo(90), now)).toBe("two-months");
  });

  it("stops when Riot ran out of games", () => {
    expect(listEnd(14, 20, daysAgo(5), now)).toBe("end");
  });

  it("stops at the longest list", () => {
    expect(listEnd(MAX_GAMES, MAX_GAMES, daysAgo(30), now)).toBe("max");
  });

  it("offers more when no game loaded yet", () => {
    expect(listEnd(20, 20, null, now)).toBe("more");
  });
});

describe("isPlainProfilePage", () => {
  const all = QUEUE_FILTERS[0];
  const solo = readQueueFilter("solo");

  it("is the All tab with its first 10 games", () => {
    expect(isPlainProfilePage(all, 10)).toBe(true);
  });

  it("isn't another tab or a longer list", () => {
    expect(isPlainProfilePage(solo, 10)).toBe(false);
    expect(isPlainProfilePage(all, 20)).toBe(false);
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
