import Form from "next/form";
import { secondButtonClass } from "@/components/ui/state-panel";
import { GAME_WINDOWS, type InsightsFilters } from "@/lib/insights-filters";

// Each field: its label above a menu in the panel colour. On phones the two
// menus share a row and Apply takes the row under them.
const field = "flex min-w-0 flex-col gap-1 max-sm:flex-[1_1_140px]";
const fieldLabel = "text-note text-quiet";
const menu = "h-10 min-w-40 rounded-md bg-panel px-2.5 text-body text-main max-sm:h-11 max-sm:w-full max-sm:min-w-0";

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
    <Form action="" aria-label="Filter insights" className="flex flex-wrap items-end gap-3">
      {Object.entries(keep).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <div className={field}>
        <label htmlFor="games" className={fieldLabel}>
          Games
        </label>
        <select id="games" name="games" defaultValue={filters.games} className={menu}>
          {GAME_WINDOWS.map((n) => (
            <option key={n} value={n}>
              Last {n}
            </option>
          ))}
        </select>
      </div>
      <div className={field}>
        <label htmlFor="champion" className={fieldLabel}>
          Champion
        </label>
        <select
          id="champion"
          name="champion"
          defaultValue={filters.champion ?? ""}
          className={menu}
        >
          <option value="">All champions</option>
          {champions.map((c) => (
            <option key={c.championName} value={c.championName}>
              {c.label} ({c.games})
            </option>
          ))}
        </select>
      </div>
      {/* 40px tall to line up with the menus; full width on phones. */}
      <button type="submit" className={`${secondButtonClass} sm:h-10 max-sm:w-full`}>
        Apply
      </button>
    </Form>
  );
}
