import { describe, expect, it } from "vitest";
import {
  addRecentPlayer,
  MAX_RECENT_PLAYERS,
  parseRecentPlayers,
  removeRecentPlayer,
  type RecentPlayer,
} from "./recent-players";

const faker: RecentPlayer = { region: "kr", gameName: "Hide on bush", tagLine: "KR1" };
const caps: RecentPlayer = { region: "euw", gameName: "G2 Caps", tagLine: "1323" };

describe("parseRecentPlayers", () => {
  it("reads back a saved list", () => {
    expect(parseRecentPlayers(JSON.stringify([faker, caps]))).toEqual([faker, caps]);
  });

  it.each([null, "", "not json", "{}", "42"])("gives an empty list for %j", (saved) => {
    expect(parseRecentPlayers(saved)).toEqual([]);
  });

  it("skips entries that aren't players or have an unknown region", () => {
    const saved = JSON.stringify([faker, null, "Faker#KR1", { ...caps, region: "mars" }, caps]);
    expect(parseRecentPlayers(saved)).toEqual([faker, caps]);
  });

  it("keeps at most the newest few", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ ...faker, gameName: `Player ${i}` }));
    expect(parseRecentPlayers(JSON.stringify(many))).toHaveLength(MAX_RECENT_PLAYERS);
  });
});

describe("addRecentPlayer", () => {
  it("puts the newest player first", () => {
    expect(addRecentPlayer([faker], caps)).toEqual([caps, faker]);
  });

  it("moves a player already in the list to the front instead of repeating them", () => {
    expect(addRecentPlayer([faker, caps], caps)).toEqual([caps, faker]);
  });

  it("treats Riot IDs with different capitals as the same player", () => {
    const lower = { region: "kr" as const, gameName: "hide on bush", tagLine: "kr1" };
    expect(addRecentPlayer([faker], lower)).toEqual([lower]);
  });

  it("keeps the same name in two regions as two players", () => {
    const fakerNa = { ...faker, region: "na" as const };
    expect(addRecentPlayer([faker], fakerNa)).toEqual([fakerNa, faker]);
  });

  it("drops the oldest player once the list is full", () => {
    let list: RecentPlayer[] = [];
    for (let i = 0; i <= MAX_RECENT_PLAYERS; i++) {
      list = addRecentPlayer(list, { ...faker, gameName: `Player ${i}` });
    }
    expect(list).toHaveLength(MAX_RECENT_PLAYERS);
    expect(list[0].gameName).toBe(`Player ${MAX_RECENT_PLAYERS}`);
    expect(list.at(-1)?.gameName).toBe("Player 1");
  });
});

describe("removeRecentPlayer", () => {
  it("removes just that player", () => {
    expect(removeRecentPlayer([faker, caps], faker)).toEqual([caps]);
  });
});
