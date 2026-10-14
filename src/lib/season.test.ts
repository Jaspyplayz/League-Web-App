import { describe, expect, it } from "vitest";
import { seasonChampions, type SeasonGame } from "./season";

function game(overrides: Partial<SeasonGame>): SeasonGame {
  return {
    matchId: "NA1_1",
    queueId: 420,
    durationS: 1800,
    championName: "Vi",
    win: true,
    kills: 5,
    deaths: 2,
    assists: 7,
    cs: 180,
    ...overrides,
  };
}

describe("seasonChampions", () => {
  it("adds up each champion's games, most played first", () => {
    const champions = seasonChampions(
      [
        game({ championName: "Vi", win: true }),
        game({ championName: "Vi", win: false, kills: 1, deaths: 6, assists: 3 }),
        game({ championName: "LeeSin" }),
      ],
      null,
    );
    expect(champions.map((c) => c.championName)).toEqual(["Vi", "LeeSin"]);
    expect(champions[0]).toMatchObject({ games: 2, wins: 1, csPerMin: 6 });
    // (5 + 1 + 7 + 3) / (2 + 6)
    expect(champions[0].kda).toBe(2);
  });

  it("only counts the chosen game modes", () => {
    const games = [game({ queueId: 420 }), game({ queueId: 450, championName: "Jinx" })];
    expect(seasonChampions(games, [450]).map((c) => c.championName)).toEqual(["Jinx"]);
  });

  it("leaves remakes out", () => {
    expect(seasonChampions([game({ durationS: 200 })], null)).toEqual([]);
  });
});
