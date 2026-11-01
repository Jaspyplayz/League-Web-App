import type { SavedRank } from "@/lib/saved-players";
import { isApexTier, tierName, type Division, type Tier } from "@/lib/tiers";
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
const DIVISION_NUMBERS: Record<Division, string> = { I: "1", II: "2", III: "3", IV: "4" };

// "D1", or just "GM" for the top three tiers, which have no divisions.
export function rankBadgeLabel({ tier, division }: SavedRank): string {
  return TIER_LETTERS[tier] + (isApexTier(tier) ? "" : DIVISION_NUMBERS[division]);
}

// "Diamond I", or just "Grandmaster".
export function rankFullName({ tier, division }: SavedRank): string {
  return isApexTier(tier) ? tierName(tier) : `${tierName(tier)} ${division}`;
}

const shape = "grid h-5 w-8 shrink-0 place-items-center rounded-sm text-xs font-bold";

// A player's solo queue rank as a short tag on their tier's tint, with the
// full rank on hover and for screen readers. Null is a dash: no rank on file.
// Undefined is an empty grey block: the rank is on its way or couldn't be read,
// so the badge claims nothing about the player.
export function RankBadge({ rank }: { rank: SavedRank | null | undefined }) {
  if (rank === undefined) return <span className={`${shape} bg-raised`} />;
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
