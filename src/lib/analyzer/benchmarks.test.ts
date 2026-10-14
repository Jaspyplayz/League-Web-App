import { describe, expect, it } from "vitest";
import { findOneTricks, oneTrickChampion, samplePlayers } from "./benchmarks";

// `count` games on `championName`, one a minute apart starting at `from`.
function games(championName: string, count: number, from = 0) {
  return Array.from({ length: count }, (_, i) => ({ championName, startedAt: from + i * 60_000 }));
}

describe("samplePlayers", () => {
  const player = (puuid: string, leaguePoints: number, extra = {}) => ({
    puuid,
    leaguePoints,
    wins: 15,
    losses: 15,
    ...extra,
  });

  it("spreads the picks from the top of the ladder to the bottom", () => {
    const ladder = [100, 900, 500, 300, 700, 800, 200, 600].map((lp) => player(`p${lp}`, lp));
    // Sorted by LP: 900, 800, 700, 600, 500, 300, 200, 100; every second one.
    expect(samplePlayers(ladder, 4)).toEqual(["p900", "p700", "p500", "p200"]);
  });

  it("skips players without enough recent games", () => {
    const ladder = [
      player("new", 900, { wins: 5, losses: 4 }),
      player("away", 800, { inactive: true }),
      player("regular", 700),
    ];
    expect(samplePlayers(ladder, 3)).toEqual(["regular"]);
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
