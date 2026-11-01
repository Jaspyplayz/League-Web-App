import type { Tier } from "@/lib/tiers";

// The rank badges' colours, the one place with raw colours for ranks
// (.claude/rules/design.md). Pale tints with dark letters read the same on
// both themes, so they don't need a light value. Emerald's mint is the only
// green on the site.
export const RANK_TINTS: Record<Tier, string> = {
  IRON: "#b9b2aa",
  BRONZE: "#dba27c",
  SILVER: "#c8ced6",
  GOLD: "#e8bd5f",
  PLATINUM: "#86d2d6",
  EMERALD: "#8edcb6",
  DIAMOND: "#a9c3ff",
  MASTER: "#d4a8f5",
  GRANDMASTER: "#f4a3aa",
  CHALLENGER: "#f8e08a",
};

export const RANK_LETTERS = "#1e1c19";
