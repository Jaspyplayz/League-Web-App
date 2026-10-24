import { describe, expect, it } from "vitest";
import { analyzeMatch, findPlayerByRiotId, isAnalyzable, whyNotAnalyzed } from "./index";
import { frames, kill, match, participants, SPOTS } from "./test-fixtures";

// A 30-minute game on another map, such as ARAM's Howling Abyss (12).
function onMap(mapId: number, players = participants()) {
  const game = match(players);
  game.info.mapId = mapId;
  return game;
}

// Arena: 16 players in pairs, on the Rings of Wrath (map 30). Newer Arena
// queues have 18.
function arena(players: number) {
  const ten = participants();
  const extra = Array.from({ length: players - 10 }, (_, i) => ({
    ...ten[i % 10],
    puuid: `player-${11 + i}`,
    participantId: 11 + i,
  }));
  return onMap(30, [...ten, ...extra]);
}

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

  it("adds the tempo timeline for junglers only", () => {
    expect(analysis.tempo).toBeNull();
    const jungle = analyzeMatch(game, timeline, "player-2")!;
    expect(jungle.tempo?.meId).toBe(2);
    expect(jungle.tempo?.enemyId).toBe(7);
    // Every second, from 0:00 to the last frame at 20:00.
    expect(jungle.tempo?.stretches[0].from).toBe(0);
    expect(jungle.tempo?.stretches.at(-1)?.to).toBe(20 * 60_000);
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

  it("skips ARAM games, which aren't on Summoner's Rift", () => {
    expect(isAnalyzable(onMap(12))).toBe(false);
  });

  it("skips Arena games of 16 or 18 players", () => {
    expect(isAnalyzable(arena(16))).toBe(false);
    expect(isAnalyzable(arena(18))).toBe(false);
  });

  it("skips a Summoner's Rift game without 10 players, such as a custom game", () => {
    expect(isAnalyzable(match(participants().slice(0, 8)))).toBe(false);
  });
});

describe("whyNotAnalyzed", () => {
  it("has no reason for a Summoner's Rift game of 15 minutes or more", () => {
    expect(whyNotAnalyzed(match())).toBeNull();
  });

  it("says only Summoner's Rift games are analyzed for ARAM and Arena", () => {
    expect(whyNotAnalyzed(onMap(12))).toBe("Only Summoner's Rift games are analyzed.");
    expect(whyNotAnalyzed(arena(16))).toBe("Only Summoner's Rift games are analyzed.");
  });

  it("names the map, not the length, for a short ARAM game", () => {
    const short = match(participants(), 10 * 60);
    short.info.mapId = 12;
    expect(whyNotAnalyzed(short)).toBe("Only Summoner's Rift games are analyzed.");
  });

  it("says a short Summoner's Rift game ended too early", () => {
    expect(whyNotAnalyzed(match(participants(), 14 * 60 + 59))).toBe(
      "This game ended before 15 minutes, which is too short to analyze.",
    );
  });

  it("says a Summoner's Rift game without 10 players isn't 5v5", () => {
    expect(whyNotAnalyzed(match(participants().slice(0, 8)))).toBe(
      "Only 5v5 games are analyzed.",
    );
  });
});
