import Form from "next/form";
import { GAME_WINDOWS, type InsightsFilters } from "@/lib/insights-filters";
import { panelClass } from "@/components/ui/panel";

const fieldLabel = "font-mono text-[11px] uppercase tracking-[0.12em] text-faint";
const select = "bg-surface py-0.5 text-base text-ink";

// "Last 50 games · Ahri" picker at the top of Insights. Like the "Compare
// with a player" form, it's a plain GET form: applying it rewrites the URL's
// ?games= and ?champion=, and the server works out the rest. `keep` carries
// the other form's choice along so applying one doesn't clear the other.
export function InsightsFilterBar({
  filters,
  champions,
  keep,
}: {
  filters: InsightsFilters;
  // The champions in the chosen window, with labels for the menu.
  champions: { championName: string; label: string; games: number }[];
  keep: Record<string, string>;
}) {
  return (
    <Form
      action=""
      aria-label="Filter insights"
      className={`${panelClass} flex flex-wrap items-end gap-x-5 gap-y-3 px-5 py-3`}
    >
      {Object.entries(keep).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <div className="flex flex-col">
        <label htmlFor="games" className={fieldLabel}>
          Games
        </label>
        <select id="games" name="games" defaultValue={filters.games} className={select}>
          {GAME_WINDOWS.map((n) => (
            <option key={n} value={n}>
              Last {n}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col">
        <label htmlFor="champion" className={fieldLabel}>
          Champion
        </label>
        <select
          id="champion"
          name="champion"
          defaultValue={filters.champion ?? ""}
          className={select}
        >
          <option value="">All champions</option>
          {champions.map((c) => (
            <option key={c.championName} value={c.championName}>
              {c.label} ({c.games})
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        className="soft-round-sm min-h-10 border border-line-strong px-4 text-sm font-semibold hover:bg-line"
      >
        Apply
      </button>
    </Form>
  );
}
