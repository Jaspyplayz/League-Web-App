import Link from "next/link";
import { INSIGHTS_VIEWS, type InsightsView } from "@/lib/insights-filters";

// "Overview | You vs others | Habits and sessions" under the filter bar. Like
// the profile tabs above it, each tab is a plain link: it only changes ?view=
// in the URL and the server draws that tab's sections. `keep` carries the
// filters along, so they apply to every tab.
//
// A pill group rather than underlined tabs, so it doesn't read as a second
// row of profile tabs.
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
      // Full width with equal columns on phones, where the three labels
      // don't fit on one line; just as wide as the labels from sm up.
      className="soft-round grid grid-cols-3 gap-1 self-stretch border border-line bg-surface p-1 sm:flex sm:self-start"
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
            className={`flex min-h-10 items-center justify-center rounded-2xl px-3 py-1.5 text-center text-sm sm:px-4 ${
              active ? "bg-line-strong font-semibold text-ink" : "text-muted hover:text-ink"
            }`}
          >
            {view.label}
          </Link>
        );
      })}
    </nav>
  );
}
