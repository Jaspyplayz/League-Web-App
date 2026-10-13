import { cacheLife } from "next/cache";

// Data Dragon is Riot's free CDN of static game data: names and images for
// champions, items, summoner spells and profile icons. It needs no API key
// and doesn't count against our rate limit.
// https://developer.riotgames.com/docs/lol#data-dragon

const BASE = "https://ddragon.leagueoflegends.com";

// `tags` are Riot's champion classes, most fitting first: ["Fighter",
// "Assassin"] for Lee Sin, ["Mage", "Support"] for Lux.
type Champion = { id: string; name: string; tags: string[] };
type SummonerSpell = { id: string; name: string };

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
};

// The parts of Data Dragon's JSON files we read.
type ChampionFile = { data: Record<string, { id: string; name: string; tags?: string[] }> };
type ItemFile = { data: Record<string, { name: string }> };
type SummonerFile = { data: Record<string, { id: string; key: string; name: string }> };

// "use cache" tells Next.js to keep the result and reuse it across requests.
// A new patch comes out every two weeks, so checking hourly is plenty. If a
// fetch throws, nothing is cached and the next request tries again.
export async function getDataDragon(): Promise<DataDragon> {
  "use cache";
  cacheLife("hours");

  const versions = await getJson<string[]>(`${BASE}/api/versions.json`);
  const version = versions[0];
  const data = `${BASE}/cdn/${version}/data/en_US`;
  // The three files don't depend on each other, so download them at once.
  const [champions, items, spells] = await Promise.all([
    getJson<ChampionFile>(`${data}/champion.json`),
    getJson<ItemFile>(`${data}/item.json`),
    getJson<SummonerFile>(`${data}/summoner.json`),
  ]);
  return buildDataDragon(version, champions, items, spells);
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

  return { version, champions, items, spells };
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

export function profileIconUrl(dd: DataDragon, iconId: number): string {
  return `${BASE}/cdn/${dd.version}/img/profileicon/${iconId}.png`;
}
