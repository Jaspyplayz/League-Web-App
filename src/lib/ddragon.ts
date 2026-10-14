import { cacheLife } from "next/cache";

// Data Dragon is Riot's free CDN of static game data: names and images for
// champions, items, summoner spells, runes and profile icons. It needs no API key
// and doesn't count against our rate limit.
// https://developer.riotgames.com/docs/lol#data-dragon

const BASE = "https://ddragon.leagueoflegends.com";

// `tags` are Riot's champion classes, most fitting first: ["Fighter",
// "Assassin"] for Lee Sin, ["Mage", "Support"] for Lux.
type Champion = { id: string; name: string; tags: string[] };
type SummonerSpell = { id: string; name: string };
type Rune = { name: string; icon: string };
// A rune tree like Precision. slots[0] holds the keystones, then one list per
// row, so the Runes tab can draw the whole tree with the picked ones lit up.
type RuneStyle = Rune & { slots: number[][] };

export type DataDragon = {
  version: string; // game patch, e.g. "15.20.1"
  // Keyed by lowercased champion id, because match data and Data Dragon don't
  // always agree on capitals ("FiddleSticks" vs "Fiddlesticks").
  champions: Record<string, Champion>;
  // Item id (as in match data) -> item name.
  items: Record<number, string>;
  // Match data names spells by number (summoner1Id = 4), but the image file
  // is named by text id ("SummonerFlash"), so keep both.
  spells: Record<number, SummonerSpell>;
  // Rune trees and runes by id, as in match data's `perks`.
  runeStyles: Record<number, RuneStyle>;
  runes: Record<number, Rune>;
};

// The parts of Data Dragon's JSON files we read.
type ChampionFile = { data: Record<string, { id: string; name: string; tags?: string[] }> };
type ItemFile = { data: Record<string, { name: string }> };
type SummonerFile = { data: Record<string, { id: string; key: string; name: string }> };
type RunesFile = {
  id: number;
  name: string;
  icon: string;
  slots: { runes: { id: number; name: string; icon: string }[] }[];
}[];

// "use cache" tells Next.js to keep the result and reuse it across requests.
// A new patch comes out every two weeks, so checking hourly is plenty. If a
// fetch throws, nothing is cached and the next request tries again.
export async function getDataDragon(): Promise<DataDragon> {
  "use cache";
  cacheLife("hours");

  const versions = await getJson<string[]>(`${BASE}/api/versions.json`);
  const version = versions[0];
  const data = `${BASE}/cdn/${version}/data/en_US`;
  // The files don't depend on each other, so download them at once.
  const [champions, items, spells, runes] = await Promise.all([
    getJson<ChampionFile>(`${data}/champion.json`),
    getJson<ItemFile>(`${data}/item.json`),
    getJson<SummonerFile>(`${data}/summoner.json`),
    getJson<RunesFile>(`${data}/runesReforged.json`),
  ]);
  return buildDataDragon(version, champions, items, spells, runes);
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Data Dragon returned ${res.status} for ${url}`);
  return (await res.json()) as T;
}

// Shrinks Riot's files down to the lookups the app uses. The full files hold
// stats, lore and descriptions we don't need, so this keeps the cached copy
// small. Separate from getDataDragon so it can be tested without a network.
export function buildDataDragon(
  version: string,
  championFile: ChampionFile,
  itemFile: ItemFile,
  summonerFile: SummonerFile,
  runesFile: RunesFile,
): DataDragon {
  const champions: DataDragon["champions"] = {};
  for (const { id, name, tags = [] } of Object.values(championFile.data)) {
    champions[id.toLowerCase()] = { id, name, tags };
  }

  const items: DataDragon["items"] = {};
  for (const [id, { name }] of Object.entries(itemFile.data)) {
    items[Number(id)] = name;
  }

  const spells: DataDragon["spells"] = {};
  for (const { id, key, name } of Object.values(summonerFile.data)) {
    spells[Number(key)] = { id, name };
  }

  const runeStyles: DataDragon["runeStyles"] = {};
  const runes: DataDragon["runes"] = {};
  for (const style of runesFile) {
    runeStyles[style.id] = {
      name: style.name,
      icon: style.icon,
      slots: style.slots.map((slot) => slot.runes.map((r) => r.id)),
    };
    for (const slot of style.slots) {
      for (const r of slot.runes) runes[r.id] = { name: r.name, icon: r.icon };
    }
  }

  return { version, champions, items, spells, runeStyles, runes };
}

export function championName(dd: DataDragon | null, championName: string): string {
  return dd?.champions[championName.toLowerCase()]?.name ?? championName;
}

// The champion's main class ("Fighter", "Mage", "Marksman"...), used to find
// similar champions. Null when Data Dragon isn't loaded or doesn't know it.
export function championClass(dd: DataDragon | null, championName: string): string | null {
  return dd?.champions[championName.toLowerCase()]?.tags[0] ?? null;
}

export function championIconUrl(dd: DataDragon, championName: string): string {
  const id = dd.champions[championName.toLowerCase()]?.id ?? championName;
  return `${BASE}/cdn/${dd.version}/img/champion/${id}.png`;
}

// Null when Data Dragon doesn't know the item (some game modes use items that
// aren't in the file), so callers can show an empty slot, not a broken image.
export function itemName(dd: DataDragon, itemId: number): string | null {
  return dd.items[itemId] ?? null;
}

export function itemIconUrl(dd: DataDragon, itemId: number): string {
  return `${BASE}/cdn/${dd.version}/img/item/${itemId}.png`;
}

export function summonerSpell(dd: DataDragon, spellId: number): SummonerSpell | null {
  return dd.spells[spellId] ?? null;
}

export function summonerSpellIconUrl(dd: DataDragon, spell: SummonerSpell): string {
  return `${BASE}/cdn/${dd.version}/img/spell/${spell.id}.png`;
}

// Rune images aren't tied to a patch, so their URL has no version.
// Works for both runes and rune trees.
export function runeIconUrl(rune: Rune): string {
  return `${BASE}/cdn/img/${rune.icon}`;
}

// The three stat shards aren't in runesReforged.json, so their names live
// here. Ids from https://static.developer.riotgames.com/docs/lol/perks.json
const STAT_SHARDS: Record<number, string> = {
  5001: "Health scaling",
  5002: "Armor",
  5003: "Magic resist",
  5005: "Attack speed",
  5007: "Ability haste",
  5008: "Adaptive force",
  5010: "Move speed",
  5011: "Health",
  5013: "Tenacity and slow resist",
};

export function statShardName(id: number): string {
  return STAT_SHARDS[id] ?? "Unknown shard";
}

export function profileIconUrl(dd: DataDragon, iconId: number): string {
  return `${BASE}/cdn/${dd.version}/img/profileicon/${iconId}.png`;
}
