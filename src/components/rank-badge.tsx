import type { SavedRank } from "@/lib/saved-players";
import { isApexTier, tierName, type Tier } from "@/lib/tiers";
import { RANK_LETTERS, RANK_TINTS } from "./rank-tints";

const TIER_LETTERS: Record<Tier, string> = {
  IRON: "I",
  BRONZE: "B",
  SILVER: "S",
  GOLD: "G",
  PLATINUM: "P",
  EMERALD: "E",
  DIAMOND: "D",
  MASTER: "M",
  GRANDMASTER: "GM",
  CHALLENGER: "C",
};
const DIVISION_NUMBERS: Record<string, string> = { I: "1", II: "2", III: "3", IV: "4" };

// "D1", or just "GM" for the top three tiers, which have no divisions.
export function rankBadgeLabel({ tier, division }: SavedRank): string {
  return TIER_LETTERS[tier] + (isApexTier(tier) ? "" : (DIVISION_NUMBERS[division] ?? ""));
}

// "Diamond I", or just "Grandmaster".
export function rankFullName({ tier, division }: SavedRank): string {
  return isApexTier(tier) ? tierName(tier) : `${tierName(tier)} ${division}`;
}

const shape = "grid h-5 w-8 shrink-0 place-items-center rounded-sm text-xs font-bold";

// A player's solo queue rank as a short tag on their tier's tint, with the
// full rank on hover and for screen readers. "loading" is an empty grey block,
// so a rank doesn't look missing while it's on its way; null is a dash.
export function RankBadge({ rank }: { rank: SavedRank | null | "loading" }) {
  if (rank === "loading") return <span className={`${shape} bg-raised`} />;
  if (!rank) {
    return (
      <span title="No solo queue rank on file" className={`${shape} bg-raised text-quiet`}>
        <span aria-hidden="true">–</span>
        <span className="sr-only">No rank on file</span>
      </span>
    );
  }
  return (
    <span
      title={rankFullName(rank)}
      className={shape}
      style={{ backgroundColor: RANK_TINTS[rank.tier], color: RANK_LETTERS }}
    >
      <span aria-hidden="true">{rankBadgeLabel(rank)}</span>
      <span className="sr-only">{rankFullName(rank)}</span>
    </span>
  );
}
