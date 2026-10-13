import { describe, expect, it } from "vitest";
import {
  buildDataDragon,
  championClass,
  championIconUrl,
  championName,
  itemIconUrl,
  itemName,
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
