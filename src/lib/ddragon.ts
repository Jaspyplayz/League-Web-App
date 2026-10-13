import { cacheLife } from "next/cache";

// Data Dragon is Riot's free CDN of static game data: champion names and
// images for champions, items and profile icons. It needs no API key and
// doesn't count against our rate limit.
// https://developer.riotgames.com/docs/lol#data-dragon

const BASE = "https://ddragon.leagueoflegends.com";

type Champion = { id: string; name: string };

export type DataDragon = {
  version: string; // game patch, e.g. "15.20.1"
  // Keyed by lowercased champion id, because match data and Data Dragon don't
  // always agree on capitals ("FiddleSticks" vs "Fiddlesticks").
  champions: Record<string, Champion>;
};

// "use cache" tells Next.js to keep the result and reuse it across requests.
// A new patch comes out every two weeks, so checking hourly is plenty. If the
// fetch throws, nothing is cached and the next request tries again.
export async function getDataDragon(): Promise<DataDragon> {
  "use cache";
  cacheLife("hours");

  const versions = await getJson<string[]>(`${BASE}/api/versions.json`);
  const version = versions[0];
  const { data } = await getJson<{ data: Record<string, Champion> }>(
    `${BASE}/cdn/${version}/data/en_US/champion.json`,
  );

  const champions: Record<string, Champion> = {};
  for (const { id, name } of Object.values(data)) {
    champions[id.toLowerCase()] = { id, name };
  }
  return { version, champions };
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Data Dragon returned ${res.status} for ${url}`);
  return (await res.json()) as T;
}

export function championName(dd: DataDragon | null, championName: string): string {
  return dd?.champions[championName.toLowerCase()]?.name ?? championName;
}

export function championIconUrl(dd: DataDragon, championName: string): string {
  const id = dd.champions[championName.toLowerCase()]?.id ?? championName;
  return `${BASE}/cdn/${dd.version}/img/champion/${id}.png`;
}

export function itemIconUrl(dd: DataDragon, itemId: number): string {
  return `${BASE}/cdn/${dd.version}/img/item/${itemId}.png`;
}

export function profileIconUrl(dd: DataDragon, iconId: number): string {
  return `${BASE}/cdn/${dd.version}/img/profileicon/${iconId}.png`;
}
