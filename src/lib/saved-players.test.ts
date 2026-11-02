import { describe, expect, it } from "vitest";
import {
  addRecentPlayer,
  hasPlayer,
  isPendingSearch,
  MAX_PINNED_PLAYERS,
  MAX_RECENT_PLAYERS,
  parsePendingSearch,
  parseSavedPlayerDetails,
  parseSavedPlayers,
  PENDING_SEARCH_MS,
  removePlayer,
  savedPlayerKey,
  togglePinnedPlayer,
  type SavedPlayer,
} from "./saved-players";

const faker: SavedPlayer = { region: "kr", gameName: "Hide on bush", tagLine: "KR1" };
const caps: SavedPlayer = { region: "euw", gameName: "G2 Caps", tagLine: "1323" };

describe("parseSavedPlayers", () => {
  it("reads back a saved list", () => {
    expect(parseSavedPlayers(JSON.stringify([faker, caps]), 5)).toEqual([faker, caps]);
  });

  it.each([null, "", "not json", "{}", "42"])("gives an empty list for %j", (saved) => {
    expect(parseSavedPlayers(saved, 5)).toEqual([]);
  });

  it("skips entries that aren't players or have an unknown region", () => {
    const saved = JSON.stringify([faker, null, "Faker#KR1", { ...caps, region: "mars" }, caps]);
    expect(parseSavedPlayers(saved, 5)).toEqual([faker, caps]);
  });

  it("keeps at most `max` players", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ ...faker, gameName: `Player ${i}` }));
    expect(parseSavedPlayers(JSON.stringify(many), 3)).toHaveLength(3);
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
    let list: SavedPlayer[] = [];
    for (let i = 0; i <= MAX_RECENT_PLAYERS; i++) {
      list = addRecentPlayer(list, { ...faker, gameName: `Player ${i}` });
    }
    expect(list).toHaveLength(MAX_RECENT_PLAYERS);
    expect(list[0].gameName).toBe(`Player ${MAX_RECENT_PLAYERS}`);
    expect(list.at(-1)?.gameName).toBe("Player 1");
  });
});

describe("removePlayer", () => {
  it("removes just that player", () => {
    expect(removePlayer([faker, caps], faker)).toEqual([caps]);
  });
});

describe("hasPlayer", () => {
  it("finds a player whatever the capitals", () => {
    expect(hasPlayer([faker], { ...faker, gameName: "HIDE ON BUSH" })).toBe(true);
    expect(hasPlayer([faker], caps)).toBe(false);
  });
});

describe("togglePinnedPlayer", () => {
  it("pins a new player at the end", () => {
    expect(togglePinnedPlayer([faker], caps)).toEqual([faker, caps]);
  });

  it("unpins a player who is already pinned", () => {
    expect(togglePinnedPlayer([faker, caps], faker)).toEqual([caps]);
  });

  it("pins nobody new once the list is full", () => {
    const full = Array.from({ length: MAX_PINNED_PLAYERS }, (_, i) => ({
      ...faker,
      gameName: `Player ${i}`,
    }));
    expect(togglePinnedPlayer(full, caps)).toBe(full);
    // Unpinning still works when full.
    expect(togglePinnedPlayer(full, full[0])).toHaveLength(MAX_PINNED_PLAYERS - 1);
  });
});

describe("parsePendingSearch", () => {
  it("reads back a saved search", () => {
    expect(parsePendingSearch(JSON.stringify({ ...faker, at: 5 }))).toEqual({ ...faker, at: 5 });
  });

  it.each([null, "", "not json", JSON.stringify(faker), JSON.stringify({ ...faker, at: "5" })])(
    "gives null for %j",
    (saved) => {
      expect(parsePendingSearch(saved)).toBeNull();
    },
  );
});

describe("parseSavedPlayerDetails", () => {
  const answer = {
    ranks: { "kr/hide on bush#kr1": { tier: "CHALLENGER", division: "I" }, "euw/g2 caps#1323": null },
    you: caps,
  };

  it("reads back the route's answer", () => {
    expect(parseSavedPlayerDetails(answer)).toEqual(answer);
  });

  it("reads an answer with nobody signed in and nobody asked about", () => {
    expect(parseSavedPlayerDetails({ ranks: {}, you: null })).toEqual({ ranks: {}, you: null });
  });

  it.each([
    ["nothing", null],
    ["a list", []],
    ["no ranks", { you: null }],
    ["ranks as a list", { ranks: [], you: null }],
    ["no you", { ranks: {} }],
    ["a tier Riot doesn't have", { ...answer, ranks: { "kr/hide on bush#kr1": { tier: "UNRANKED", division: "I" } } }],
    ["a division with no tier", { ...answer, ranks: { "kr/hide on bush#kr1": { division: "I" } } }],
    ["you in an unknown region", { ...answer, you: { ...caps, region: "mars" } }],
    ["you with no Riot ID", { ...answer, you: { region: "na" } }],
  ])("gives null for an answer with %s", (_name, data) => {
    expect(parseSavedPlayerDetails(data)).toBeNull();
  });
});

describe("savedPlayerKey", () => {
  it("is the same whatever the capitals", () => {
    expect(savedPlayerKey({ region: "kr", gameName: "HIDE on Bush", tagLine: "kr1" })).toBe(
      savedPlayerKey({ region: "kr", gameName: "Hide on bush", tagLine: "KR1" }),
    );
  });

  it("differs by region", () => {
    expect(savedPlayerKey({ region: "kr", gameName: "A", tagLine: "B" })).not.toBe(
      savedPlayerKey({ region: "na", gameName: "A", tagLine: "B" }),
    );
  });
});

describe("isPendingSearch", () => {
  const searched = { region: "kr" as const, gameName: "hide on bush", tagLine: "kr1", at: 1000 };

  it("matches the searched player, whatever the capitals", () => {
    expect(isPendingSearch(searched, faker, 2000)).toBe(true);
  });

  it("doesn't match a different player, such as one clicked in a match", () => {
    expect(isPendingSearch(searched, caps, 2000)).toBe(false);
  });

  it("doesn't match once the search is over a minute old", () => {
    expect(isPendingSearch(searched, faker, 1000 + PENDING_SEARCH_MS + 1)).toBe(false);
  });

  it("doesn't match when there was no search", () => {
    expect(isPendingSearch(null, faker, 2000)).toBe(false);
  });
});
