import { describe, expect, it } from "vitest";
import { findOneTricks, oneTrickChampion, topPlayers } from "./benchmarks";

// `count` games on `championName`, one a minute apart starting at `from`.
function games(championName: string, count: number, from = 0) {
  return Array.from({ length: count }, (_, i) => ({ championName, startedAt: from + i * 60_000 }));
}

describe("topPlayers", () => {
  it("picks the highest LP first", () => {
    const league = {
      entries: [
        { puuid: "a", leaguePoints: 900, wins: 1, losses: 1 },
        { puuid: "b", leaguePoints: 1500, wins: 1, losses: 1 },
        { puuid: "c", leaguePoints: 1200, wins: 1, losses: 1 },
      ],
    };
    expect(topPlayers(league, 2)).toEqual(["b", "c"]);
  });
});

describe("oneTrickChampion", () => {
  it("finds a player who mostly plays one champion", () => {
    expect(oneTrickChampion([...games("LeeSin", 12), ...games("Viego", 8)])).toBe("LeeSin");
  });

  it("returns null when no champion reaches 60%", () => {
    expect(oneTrickChampion([...games("LeeSin", 11), ...games("Viego", 9)])).toBeNull();
  });

  it("returns null with too few games to tell", () => {
    expect(oneTrickChampion(games("LeeSin", 9))).toBeNull();
  });

  it("only looks at the 20 most recent games", () => {
    // 20 old Viego games, then 15 recent Lee Sin and 5 Viego: they've switched.
    const old = games("Viego", 20, 0);
    const recent = [...games("LeeSin", 15, 10_000_000), ...games("Viego", 5, 20_000_000)];
    expect(oneTrickChampion([...old, ...recent])).toBe("LeeSin");
  });
});

describe("findOneTricks", () => {
  it("checks each player separately", () => {
    const rows = [
      ...games("Ahri", 15).map((g) => ({ ...g, puuid: "otp" })),
      ...games("Ahri", 5).map((g) => ({ ...g, puuid: "flex" })),
      ...games("Syndra", 5).map((g) => ({ ...g, puuid: "flex" })),
    ];
    expect(findOneTricks(rows)).toEqual(new Map([["otp", "Ahri"]]));
  });
});
