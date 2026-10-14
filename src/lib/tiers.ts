// Ranked tiers, lowest first, as Riot spells them. The bottom seven have four
// divisions each (IV is lowest); Master, Grandmaster and Challenger have one
// ladder each, ordered by LP.
export const TIERS = [
  "IRON",
  "BRONZE",
  "SILVER",
  "GOLD",
  "PLATINUM",
  "EMERALD",
  "DIAMOND",
  "MASTER",
  "GRANDMASTER",
  "CHALLENGER",
] as const;
export type Tier = (typeof TIERS)[number];

export const APEX_TIERS = ["MASTER", "GRANDMASTER", "CHALLENGER"] as const;
export type ApexTier = (typeof APEX_TIERS)[number];

export const DIVISIONS = ["I", "II", "III", "IV"] as const;
export type Division = (typeof DIVISIONS)[number];

export function isTier(value: string): value is Tier {
  return (TIERS as readonly string[]).includes(value);
}

export function isApexTier(tier: Tier): tier is ApexTier {
  return (APEX_TIERS as readonly string[]).includes(tier);
}

// "GRANDMASTER" -> "Grandmaster".
export function tierName(tier: Tier): string {
  return tier[0] + tier.slice(1).toLowerCase();
}
