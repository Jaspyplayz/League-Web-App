import { describe, expect, it } from "vitest";
import { isPuuid } from "./puuid";

// Made up, since the repo is public: 78 characters like Riot's PUUIDs, with
// letters, digits, "-" and "_".
const MADE_UP_PUUID = "Ab1-_".repeat(15) + "Cd2";

describe("isPuuid", () => {
  it.each([
    ["one shaped like Riot's", MADE_UP_PUUID],
    ["the golden games' anonymized IDs", "golden-player-1"],
    ["1 character", "a"],
    ["100 characters", "x".repeat(100)],
  ])("accepts %s", (_name, value) => {
    expect(isPuuid(value)).toBe(true);
  });

  // JAS-214: a NUL reached Postgres, which refuses one.
  it.each([
    ["a NUL", "\u0000"],
    ["a Riot-shaped ID with a NUL in it", `${MADE_UP_PUUID.slice(0, 39)}\u0000${MADE_UP_PUUID.slice(40)}`],
    ["an empty ID", ""],
    ["101 characters", "x".repeat(101)],
    ["a space", "player 1"],
    ["a line break at the end", "player-1\n"],
    ["a slash and dots", "../player-1"],
    ["a non-ASCII letter", "playér-1"],
    ["undefined", undefined],
    ["null", null],
    ["a number", 42],
  ])("refuses %s", (_name, value) => {
    expect(isPuuid(value)).toBe(false);
  });
});
