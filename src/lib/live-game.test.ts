import { describe, expect, it } from "vitest";
import { liveGameLabel } from "./live-game";

const NOW = Date.UTC(2026, 9, 19, 20, 0);

describe("liveGameLabel", () => {
  it("names the queue and how many minutes the game has run", () => {
    const game = { gameQueueConfigId: 420, gameStartTime: NOW - 12.5 * 60_000 };
    expect(liveGameLabel(game, NOW)).toBe("In game · Ranked Solo · 12 min");
  });

  it("says loading in before the game has started", () => {
    expect(liveGameLabel({ gameQueueConfigId: 450, gameStartTime: 0 }, NOW)).toBe(
      "In game · ARAM · loading in",
    );
  });

  it("leaves out queues it doesn't know", () => {
    expect(liveGameLabel({ gameQueueConfigId: 0, gameStartTime: NOW }, NOW)).toBe("In game · 0 min");
  });
});
