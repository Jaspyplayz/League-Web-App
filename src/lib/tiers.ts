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

// "DIAMOND" -> "D". Gold and Grandmaster share a G, but the track never
// shows both: it stops at Master, the tier after Diamond.
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

// One number for a rank, so ranks can be drawn on a graph: 100 points per
// division and 400 per tier, plus LP. Iron IV 0 LP is 0, Diamond I 75 LP is
// 2775, and Master and above start at 2800 and add LP, since their LP keeps
// climbing on one ladder. Null for a tier we don't recognize.
export function rankScore(tier: string, rank: string, lp: number): number | null {
  if (!isTier(tier)) return null;
  if (isApexTier(tier)) return TIERS.indexOf("MASTER") * 400 + lp;
  const division = [...DIVISIONS].reverse().indexOf(rank as Division); // IV = 0, I = 3
  if (division === -1) return null;
  return TIERS.indexOf(tier) * 400 + division * 100 + lp;
}

// The reverse, for the graph's labels: 2700 -> "D1", 2800 -> "M". Only
// meant for scores that land exactly on a division.
export function scoreLabel(score: number): string {
  const master = TIERS.indexOf("MASTER") * 400;
  if (score >= master) return "M";
  const tier = TIERS[Math.floor(score / 400)];
  const division = 4 - Math.floor((score % 400) / 100);
  return `${tierLetter(tier)}${division}`;
}
