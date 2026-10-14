import { describe, expect, it } from "vitest";
import {
  buildDataDragon,
  championClass,
  championIconUrl,
  championName,
  itemIconUrl,
  itemName,
  runeIconUrl,
  statShardName,
  summonerSpell,
  summonerSpellIconUrl,
} from "./ddragon";

// Tiny slices of Riot's real files, with the same shapes.
const dd = buildDataDragon(
  "15.20.1",
  {
    data: {
      Ahri: { id: "Ahri", name: "Ahri", tags: ["Mage", "Assassin"] },
      Fiddlesticks: { id: "Fiddlesticks", name: "Fiddlesticks" },
      MonkeyKing: { id: "MonkeyKing", name: "Wukong" },
    },
  },
  { data: { "3089": { name: "Rabadon's Deathcap" }, "3340": { name: "Stealth Ward" } } },
  {
    data: {
      SummonerFlash: { id: "SummonerFlash", key: "4", name: "Flash" },
      SummonerDot: { id: "SummonerDot", key: "14", name: "Ignite" },
    },
  },
  [
    {
      id: 8100,
      name: "Domination",
      icon: "perk-images/Styles/7200_Domination.png",
      slots: [
        {
          runes: [
            {
              id: 8112,
              name: "Electrocute",
              icon: "perk-images/Styles/Domination/Electrocute.png",
            },
            { id: 8128, name: "Dark Harvest", icon: "perk-images/Styles/Domination/Dark.png" },
          ],
        },
        {
          runes: [
            { id: 8126, name: "Cheap Shot", icon: "perk-images/Styles/Domination/Cheap.png" },
          ],
        },
      ],
    },
  ],
);

const CDN = "https://ddragon.leagueoflegends.com/cdn/15.20.1/img";

describe("champions", () => {
  it("shows the display name, which can differ from the id", () => {
    expect(championName(dd, "MonkeyKing")).toBe("Wukong");
  });

  it("matches ids whatever their capitals", () => {
    expect(championIconUrl(dd, "FiddleSticks")).toBe(`${CDN}/champion/Fiddlesticks.png`);
  });

  it("uses the first tag as the champion's class", () => {
    expect(championClass(dd, "Ahri")).toBe("Mage");
    expect(championClass(dd, "MonkeyKing")).toBeNull();
    expect(championClass(null, "Ahri")).toBeNull();
  });

  it("falls back to the raw name for unknown champions or no Data Dragon", () => {
    expect(championName(dd, "NewChamp")).toBe("NewChamp");
    expect(championName(null, "Ahri")).toBe("Ahri");
  });
});

describe("items", () => {
  it("looks up names and builds image URLs by id", () => {
    expect(itemName(dd, 3089)).toBe("Rabadon's Deathcap");
    expect(itemIconUrl(dd, 3089)).toBe(`${CDN}/item/3089.png`);
  });

  it("returns null for items Data Dragon doesn't have", () => {
    expect(itemName(dd, 999999)).toBeNull();
  });
});

describe("summoner spells", () => {
  it("turns the number in match data into the image name", () => {
    const flash = summonerSpell(dd, 4);
    expect(flash).toEqual({ id: "SummonerFlash", name: "Flash" });
    expect(summonerSpellIconUrl(dd, flash!)).toBe(`${CDN}/spell/SummonerFlash.png`);
  });

  it("returns null for unknown spells", () => {
    expect(summonerSpell(dd, 0)).toBeNull();
  });
});

describe("runes", () => {
  it("keeps each tree's rows of rune ids, keystones first", () => {
    expect(dd.runeStyles[8100].slots).toEqual([[8112, 8128], [8126]]);
    expect(dd.runes[8112].name).toBe("Electrocute");
  });

  it("builds image URLs without a patch version", () => {
    expect(runeIconUrl(dd.runes[8112])).toBe(
      "https://ddragon.leagueoflegends.com/cdn/img/perk-images/Styles/Domination/Electrocute.png",
    );
  });

  it("names stat shards, which Data Dragon leaves out", () => {
    expect(statShardName(5008)).toBe("Adaptive force");
    expect(statShardName(1)).toBe("Unknown shard");
  });
});
