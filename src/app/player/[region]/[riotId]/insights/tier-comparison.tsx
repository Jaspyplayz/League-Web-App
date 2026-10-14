import Form from "next/form";
import { PanelHeading } from "@/components/ui/panel-heading";
import type { BenchmarkComparison as Comparison } from "@/lib/analyzer/compare";
import { plural } from "@/lib/analyzer/format";
import type { DataDragon } from "@/lib/ddragon";
import { tierName, type Tier } from "@/lib/tiers";
import { BenchmarkComparison } from "./benchmark-comparison";

const fieldLabel = "font-mono text-[11px] uppercase tracking-[0.12em] text-faint";

// "You vs Diamond": your games next to benchmark games from players of the
// rank you pick (see src/lib/analyzer/compare.ts). The menu lists only the
// ranks `npm run benchmarks` has collected games for.
export function TierComparison({
  tier,
  tiers,
  comparison,
  keep,
  dd,
}: {
  tier: Tier;
  tiers: { tier: Tier; games: number }[];
  // Null when none of your games has enough of this rank's games to compare.
  comparison: Comparison | null;
  // The page's other choices, carried along so picking a rank keeps them.
  keep: Record<string, string>;
  dd: DataDragon | null;
}) {
  return (
    <section aria-labelledby="benchmark-heading" className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PanelHeading id="benchmark-heading">You vs {tierName(tier)}</PanelHeading>
        <Form action="" aria-label="Compare with a rank" className="flex items-end gap-2">
          {Object.entries(keep).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <div className="flex flex-col">
            <label htmlFor="tier" className={fieldLabel}>
              Rank
            </label>
            <select
              id="tier"
              name="tier"
              defaultValue={tier.toLowerCase()}
              className="bg-surface py-0.5 text-base text-ink"
            >
              {tiers.map((t) => (
                <option key={t.tier} value={t.tier.toLowerCase()}>
                  {tierName(t.tier)} ({plural(t.games, "game")})
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="min-h-10 rounded-lg border border-line-strong px-4 text-sm font-semibold hover:bg-line"
          >
            Compare
          </button>
        </Form>
      </div>
      {comparison ? (
        <BenchmarkComparison comparison={comparison} against={{ kind: "tier", tier }} dd={dd} />
      ) : (
        <p className="rounded-[14px] border border-line-strong bg-surface px-5 py-4 text-muted">
          Not enough {tierName(tier)} games in your roles to compare with yet.
        </p>
      )}
    </section>
  );
}
