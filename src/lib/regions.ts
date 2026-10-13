// Riot routes summoner/league calls to a platform host and account/match
// calls to a regional host.
export const REGIONS = {
  na: { label: "North America", platform: "na1", regional: "americas" },
  euw: { label: "Europe West", platform: "euw1", regional: "europe" },
  eune: { label: "Europe Nordic & East", platform: "eun1", regional: "europe" },
  kr: { label: "Korea", platform: "kr", regional: "asia" },
  jp: { label: "Japan", platform: "jp1", regional: "asia" },
  br: { label: "Brazil", platform: "br1", regional: "americas" },
  lan: { label: "Latin America North", platform: "la1", regional: "americas" },
  las: { label: "Latin America South", platform: "la2", regional: "americas" },
  oce: { label: "Oceania", platform: "oc1", regional: "sea" },
  tr: { label: "Turkey", platform: "tr1", regional: "europe" },
  ru: { label: "Russia", platform: "ru", regional: "europe" },
} as const;

export type Region = keyof typeof REGIONS;

export function isRegion(value: string): value is Region {
  return Object.hasOwn(REGIONS, value);
}
