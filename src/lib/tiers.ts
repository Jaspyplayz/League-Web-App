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

// One dot on the rank progress track under a ranked card, like DeepLoL's
// "D4 D3 D2 D1 M" line.
export type TrackStep = { label: string; state: "done" | "current" | "next" };

// "DIAMOND" -> "D". Each tier starts with a different letter.
function tierLetter(tier: Tier): string {
  return tier[0];
}

// The four divisions of the player's tier, lowest first, then the next tier.
// Null for Master and above (one ladder, no divisions) or data we don't
// recognize, so the card just leaves the track out.
export function tierTrack(tier: string, rank: string): TrackStep[] | null {
  if (!isTier(tier) || isApexTier(tier)) return null;
  // DIVISIONS is highest first (I, II, III, IV); the track reads lowest first.
  const lowestFirst = [...DIVISIONS].reverse();
  const at = lowestFirst.indexOf(rank as Division);
  if (at === -1) return null;

  const steps: TrackStep[] = lowestFirst.map((_, i) => ({
    label: `${tierLetter(tier)}${4 - i}`,
    state: i < at ? "done" : i === at ? "current" : "next",
  }));
  const next = TIERS[TIERS.indexOf(tier) + 1];
  steps.push({ label: isApexTier(next) ? tierLetter(next) : `${tierLetter(next)}4`, state: "next" });
  return steps;
}
