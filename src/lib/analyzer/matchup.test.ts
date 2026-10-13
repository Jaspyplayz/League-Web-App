import { describe, expect, it } from "vitest";
import { diffSeries, findOpponent, snapshotAt, teamGoldSeries } from "./matchup";
import { frames, participants } from "./test-fixtures";

describe("findOpponent", () => {
  it("finds the enemy in the same position", () => {
    const players = participants();
    expect(findOpponent(players, players[2])?.championName).toBe("Syndra");
    expect(findOpponent(players, players[1])?.championName).toBe("LeeSin");
  });

  it("falls back to Riot's position guess when positions are missing", () => {
    const players = participants();
    players[2].teamPosition = "";
    players[7].teamPosition = "";
    expect(findOpponent(players, players[2])?.championName).toBe("Syndra");
  });

  it("gives up when no single enemy matches", () => {
    const players = participants();
    for (const p of players) {
      p.teamPosition = "";
      p.individualPosition = "Invalid";
    }
    expect(findOpponent(players, players[2])).toBeNull();
  });
});

// Mid (3) earns 400 gold a minute, the enemy mid (8) 350, so mid gains 50 a
// minute. Everyone else earns 300.
const game = frames(20, (minute, id) => ({
  gold: minute * (id === 3 ? 400 : id === 8 ? 350 : 300),
  cs: minute * (id === 3 ? 8 : 7),
  xp: minute * 400,
}));

describe("diffSeries", () => {
  it("subtracts the opponent's numbers from yours every minute", () => {
    const gold = diffSeries(game, 3, 8, "gold");
    expect(gold[0]).toEqual({ minute: 0, diff: 0 });
    expect(gold[10]).toEqual({ minute: 10, diff: 500 });
    expect(diffSeries(game, 3, 8, "cs")[10].diff).toBe(10);
    expect(diffSeries(game, 3, 8, "xp")[10].diff).toBe(0);
  });
});

describe("snapshotAt", () => {
  it("reads both players at the given minute", () => {
    expect(snapshotAt(game, 3, 8, 10)).toEqual({
      minute: 10,
      you: { gold: 4000, cs: 80, xp: 4000, damage: 0 },
      opponent: { gold: 3500, cs: 70, xp: 4000, damage: 0 },
    });
  });

  it("is null when the game ended before then", () => {
    // Frames 0 to 12, and frame 12 is the end of the game.
    const short = frames(12);
    expect(snapshotAt(short, 3, 8, 10)).not.toBeNull();
    expect(snapshotAt(short, 3, 8, 12)).toBeNull();
    expect(snapshotAt(short, 3, 8, 15)).toBeNull();
  });
});

describe("teamGoldSeries", () => {
  it("is your team's total gold minus the enemy's", () => {
    // Blue earns 300 * 4 + 400 = 1600 a minute, red 300 * 4 + 350 = 1550.
    expect(teamGoldSeries(game, participants(), 100)[10].diff).toBe(500);
    expect(teamGoldSeries(game, participants(), 200)[10].diff).toBe(-500);
  });
});
