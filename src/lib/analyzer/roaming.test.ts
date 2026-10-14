import { describe, expect, it } from "vitest";
import type { MapPosition } from "@/lib/riot/types";
import { enemyHalfShare, strongerSideShare } from "./roaming";
import { frames, participants } from "./test-fixtures";

// Participant 2 is blue's jungler and 7 is red's. Blue's laners are 1 (top),
// 3 (mid), 4 and 5 (bot); red's are 6, 8, 9 and 10.
const players = participants();
const blueJungler = players[1];
const redJungler = players[6];

const TOP_SIDE: MapPosition = { x: 4000, y: 8000 }; // blue's top side jungle
const BOT_SIDE: MapPosition = { x: 11000, y: 7000 }; // red's bot side jungle
const MID_LANE: MapPosition = { x: 7400, y: 7300 };
const BARON_PIT: MapPosition = { x: 5007, y: 10471 }; // red's half of the river
const ENEMY_BOT_LANE: MapPosition = { x: 13500, y: 8000 };

// A 20 minute game where the jungler (participant `id`) stands at
// `spot(minute)` and each player's gold is `gold(id)` all game.
function game(
  id: number,
  spot: (minute: number) => MapPosition | null,
  gold: (participantId: number) => number = () => 0,
) {
  return frames(20, (minute, pid) => ({
    gold: gold(pid),
    position: pid === id ? spot(minute) : null,
  }));
}

describe("strongerSideShare", () => {
  // Blue's top laner is 1000 gold up; bot lane is even.
  const topAhead = (pid: number) => (pid === 1 ? 1000 : 0);

  it("counts minutes from 3:00 to 15:00 on the side with the bigger lead", () => {
    // Top side for minutes 3-8 (6 minutes), bot side for 9-15 (7 minutes).
    const result = strongerSideShare(
      game(2, (m) => (m <= 8 ? TOP_SIDE : BOT_SIDE), topAhead),
      players,
      blueJungler,
    );
    expect(result).toBeCloseTo(6 / 13);
  });

  it("compares the two sides, so a stomp doesn't count every minute", () => {
    // Every lane is far ahead, but top is further ahead than bot.
    const stomp = (pid: number) => ({ 1: 2500, 4: 800, 5: 700 })[pid] ?? 0;
    expect(strongerSideShare(game(2, () => TOP_SIDE, stomp), players, blueJungler)).toBe(1);
    expect(strongerSideShare(game(2, () => BOT_SIDE, stomp), players, blueJungler)).toBe(0);
  });

  it("skips minutes when the sides are close, or you're in mid or base", () => {
    const slightlyAhead = (pid: number) => (pid === 1 ? 300 : 0);
    expect(strongerSideShare(game(2, () => TOP_SIDE, slightlyAhead), players, blueJungler)).toBeNull();
    expect(strongerSideShare(game(2, () => MID_LANE, topAhead), players, blueJungler)).toBeNull();
    expect(strongerSideShare(game(2, () => null, topAhead), players, blueJungler)).toBeNull();
  });

  it("reads leads from your team's point of view", () => {
    // Blue's top laner is up, so for red, bot side is the stronger side.
    expect(strongerSideShare(game(7, () => BOT_SIDE, topAhead), players, redJungler)).toBe(1);
  });
});

describe("enemyHalfShare", () => {
  it("counts minutes past the halfway line, river included", () => {
    // Red's jungle for minutes 3-6, the Baron pit at 7, home for 8-15.
    const spot = (m: number) => (m <= 6 ? BOT_SIDE : m === 7 ? BARON_PIT : TOP_SIDE);
    expect(enemyHalfShare(game(2, spot), blueJungler)).toBeCloseTo(5 / 13);
  });

  it("leaves lanes out, and works for either team", () => {
    expect(enemyHalfShare(game(2, () => ENEMY_BOT_LANE), blueJungler)).toBe(0);
    expect(enemyHalfShare(game(7, () => TOP_SIDE), redJungler)).toBe(1);
  });

  it("is null when Riot left out every position", () => {
    expect(enemyHalfShare(game(2, () => null), blueJungler)).toBeNull();
  });
});
