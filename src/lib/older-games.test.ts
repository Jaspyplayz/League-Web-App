import { describe, expect, it } from "vitest";
import { QUEUE_FILTERS, readQueueFilter } from "./queue-filters";
import type { Match } from "./riot/types";
import { hasOlderGames, matchListHref, nextBefore, oldestAllowed, readBefore } from "./older-games";

const NOW = Date.UTC(2026, 9, 14, 16, 0); // Oct 14, 2026, in ms
const NOW_S = NOW / 1000;
const DAY_S = 24 * 60 * 60;

function match(info: { gameCreation?: number; gameStartTimestamp: number }): Match {
  return {
    metadata: { matchId: "NA1_1" },
    info: {
      platformId: "NA1",
      gameVersion: "16.20",
      queueId: 420,
      gameDuration: 1800,
      participants: [],
      ...info,
    },
  };
}

describe("oldestAllowed", () => {
  it("is 60 days before now, in seconds", () => {
    expect(oldestAllowed(NOW)).toBe(NOW_S - 60 * DAY_S);
  });
});

describe("readBefore", () => {
  it("reads a time within the last two months", () => {
    expect(readBefore(String(NOW_S - 10 * DAY_S), NOW)).toBe(NOW_S - 10 * DAY_S);
  });

  it("ignores anything older than two months", () => {
    expect(readBefore(String(NOW_S - 61 * DAY_S), NOW)).toBeNull();
  });

  it("ignores anything that isn't a whole number of seconds", () => {
    expect(readBefore(undefined, NOW)).toBeNull();
    expect(readBefore("yesterday", NOW)).toBeNull();
    expect(readBefore("-5", NOW)).toBeNull();
    expect(readBefore("1.5", NOW)).toBeNull();
    expect(readBefore([String(NOW_S - DAY_S)], NOW)).toBeNull();
  });

  it("ignores a time in the future", () => {
    expect(readBefore(String(NOW_S + DAY_S), NOW)).toBeNull();
  });
});

describe("nextBefore", () => {
  it("is a second before the game was created", () => {
    const start = NOW - 3 * DAY_S * 1000;
    expect(nextBefore(match({ gameCreation: start - 90_000, gameStartTimestamp: start }))).toBe(
      (start - 90_000) / 1000 - 1,
    );
  });

  it("falls back to the start time", () => {
    const start = NOW - 3 * DAY_S * 1000;
    expect(nextBefore(match({ gameStartTimestamp: start }))).toBe(start / 1000 - 1);
  });
});

describe("hasOlderGames", () => {
  it("offers more after a full page inside two months", () => {
    expect(hasOlderGames(10, 10, NOW_S - 5 * DAY_S, NOW)).toBe(true);
  });

  it("stops after a short page", () => {
    expect(hasOlderGames(7, 10, NOW_S - 5 * DAY_S, NOW)).toBe(false);
  });

  it("stops at two months", () => {
    expect(hasOlderGames(10, 10, NOW_S - 60 * DAY_S, NOW)).toBe(false);
  });
});

describe("matchListHref", () => {
  const all = QUEUE_FILTERS[0];

  it("links the latest games with no query", () => {
    expect(matchListHref("/player/na/Jaspy-CA1", all, null)).toBe(
      "/player/na/Jaspy-CA1#matches-heading",
    );
  });

  it("keeps the game-mode tab", () => {
    expect(matchListHref("/player/na/Jaspy-CA1", readQueueFilter("solo"), 123)).toBe(
      "/player/na/Jaspy-CA1?queue=solo&before=123#matches-heading",
    );
  });
});
