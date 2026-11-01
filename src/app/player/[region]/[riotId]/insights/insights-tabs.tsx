import Link from "next/link";
import { INSIGHTS_VIEWS, type InsightsView } from "@/lib/insights-filters";

// "Overview | You vs others | Habits and sessions" under the filter bar. Like
// the profile tabs above it, each tab is a plain link: it only changes ?view=
// in the URL and the server draws that tab's sections. `keep` carries the
// filters along, so they apply to every tab.
//
// A small segmented switch rather than underlined tabs, so it doesn't read
// as a second row of profile tabs.
export function InsightsTabs({
  insightsPath,
  current,
  keep,
}: {
  insightsPath: string; // e.g. "/player/na/Name-TAG/insights"
  current: InsightsView;
  keep: Record<string, string>;
}) {
  return (
    <nav
      aria-label="Insights views"
      // Equal thirds across the screen on phones, where the three labels
      // only just fit; just as wide as the labels from sm up.
      className="grid grid-cols-3 gap-0.5 self-stretch rounded-md bg-panel p-[3px] sm:flex sm:self-start"
    >
      {INSIGHTS_VIEWS.map((view) => {
        const active = view.id === current;
        const query = new URLSearchParams({ ...keep, view: view.id });
        return (
          <Link
            key={view.id}
            href={`${insightsPath}?${query}`}
            // Stay where you are on the page instead of jumping to the top.
            scroll={false}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-10 items-center justify-center rounded-sm px-1.5 text-center text-sm leading-tight transition-colors duration-320 ease-out hover:duration-120 motion-reduce:transition-none sm:px-3.5 ${
              active ? "bg-raised font-medium text-main" : "text-quiet hover:bg-select hover:text-main"
            }`}
          >
            {view.label}
          </Link>
        );
      })}
    </nav>
  );
}
