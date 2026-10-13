import { describe, expect, it } from "vitest";
import { analyzeMatch, findPlayerByRiotId, isAnalyzable } from "./index";
import { frames, kill, match, participants, SPOTS } from "./test-fixtures";

describe("analyzeMatch", () => {
  // Ahri (blue mid, participant 3) loses 100 gold a minute to Syndra (8).
  const game = match();
  const timeline = {
    frames: frames(20, (minute, id) => ({
      gold: minute * (id === 3 ? 300 : 400),
      cs: minute * 8,
    })),
    events: [kill("8:10", 7, 3, [8], SPOTS.midLane)],
  };
  const analysis = analyzeMatch(game, timeline, "player-3", (name) =>
    name === "LeeSin" ? "Lee Sin" : name,
  )!;

  it("compares you with the enemy in your role", () => {
    expect(analysis.me.championName).toBe("Ahri");
    expect(analysis.opponent?.championName).toBe("Syndra");
    expect(analysis.series?.gold[10]).toEqual({ minute: 10, diff: -1000 });
    expect(analysis.at10?.you.gold).toBe(3000);
    expect(analysis.at15?.opponent.gold).toBe(6000);
  });

  it("labels deaths and lists them", () => {
    expect(analysis.deaths).toEqual([
      { timestamp: 490_000, label: "gank", enemyIds: [7, 8], early: true },
    ]);
  });

  it("compares team gold", () => {
    // Blue earns 300 + 4 * 400, red 5 * 400: blue loses 100 a minute.
    expect(analysis.teamGold[20].diff).toBe(-2000);
  });

  it("returns null for a player who isn't in the match", () => {
    expect(analyzeMatch(game, timeline, "nobody")).toBeNull();
  });

  it("still lists deaths and team gold without an opponent", () => {
    const players = participants();
    players[7].teamPosition = "MIDDLE";
    players[6].teamPosition = "MIDDLE"; // two enemy mids: no clear opponent
    players[6].individualPosition = "MIDDLE";
    const odd = analyzeMatch(match(players), timeline, "player-3")!;
    expect(odd.opponent).toBeNull();
    expect(odd.series).toBeNull();
    expect(odd.turningPoints).toEqual([]);
    expect(odd.deaths).toHaveLength(1);
  });
});

describe("findPlayerByRiotId", () => {
  it("ignores capitals", () => {
    expect(findPlayerByRiotId(match(), "player3", "na1")?.puuid).toBe("player-3");
    expect(findPlayerByRiotId(match(), "Someone", "NA1")).toBeNull();
  });
});

describe("isAnalyzable", () => {
  it("skips games under 15 minutes", () => {
    expect(isAnalyzable(match(participants(), 14 * 60 + 59))).toBe(false);
    expect(isAnalyzable(match(participants(), 15 * 60))).toBe(true);
  });
});
