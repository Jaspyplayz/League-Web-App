import Form from "next/form";
import { panelClass } from "@/components/ui/panel";
import { PanelHeading } from "@/components/ui/panel-heading";
import { secondButtonClass } from "@/components/ui/state-panel";
import type { BenchmarkComparison as Comparison } from "@/lib/analyzer/compare";
import { plural } from "@/lib/analyzer/format";
import type { SkillFocus } from "@/lib/analyzer/skill";
import type { DataDragon } from "@/lib/ddragon";
import { tierName, type Tier } from "@/lib/tiers";
import { BenchmarkComparison } from "./benchmark-comparison";
import { SkillCompare } from "./skill-compare";

// "You vs Diamond": your games next to benchmark games from players of the
// rank you pick (see src/lib/analyzer/compare.ts). The menu lists only the
// ranks `npm run benchmarks` has collected games for.
export function TierComparison({
  tier,
  tiers,
  comparison,
  skill,
  keep,
  dd,
}: {
  tier: Tier;
  tiers: { tier: Tier; games: number }[];
  // Null when none of your games has enough of this rank's games to compare.
  comparison: Comparison | null;
  skill: SkillFocus | null;
  // The page's other choices, carried along so picking a rank keeps them.
  keep: Record<string, string>;
  dd: DataDragon | null;
}) {
  return (
    <section
      aria-labelledby="benchmark-heading"
      className={`${panelClass} flex flex-col gap-4 p-4 sm:px-5`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PanelHeading id="benchmark-heading">You vs {tierName(tier)}</PanelHeading>
        <Form action="" aria-label="Compare with a rank" className="flex items-end gap-2.5">
          {Object.entries(keep).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor="tier" className="text-note text-quiet">
              Rank
            </label>
            <select
              id="tier"
              name="tier"
              defaultValue={tier.toLowerCase()}
              className="h-11 min-w-0 rounded-md bg-raised px-2.5 text-body text-main"
            >
              {tiers.map((t) => (
                <option key={t.tier} value={t.tier.toLowerCase()}>
                  {tierName(t.tier)} ({plural(t.games, "game")})
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className={secondButtonClass}>
            Compare
          </button>
        </Form>
      </div>
      <SkillCompare focus={skill} />
      {comparison ? (
        <BenchmarkComparison comparison={comparison} against={{ kind: "tier", tier }} dd={dd} />
      ) : (
        <p className="text-body text-quiet">
          Not enough {tierName(tier)} games in your roles to compare with yet.
        </p>
      )}
    </section>
  );
}

// The same section before `npm run benchmarks` has collected any rank's
// games: the heading stays, and the panel says why there's nothing in it.
export function NoRanks() {
  return (
    <section aria-labelledby="benchmark-heading" className={`${panelClass} flex flex-col gap-1.5 p-4 sm:px-5`}>
      <PanelHeading id="benchmark-heading">You vs other ranks</PanelHeading>
      <p className="text-body text-quiet">
        Turnpoint hasn&apos;t collected games from any rank yet, so there&apos;s no one to compare
        you with. Compare with a player below instead.
      </p>
    </section>
  );
}
