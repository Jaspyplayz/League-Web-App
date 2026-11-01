import Link from "next/link";
import { hoverFade } from "@/components/header-style";

// The profile's three tabs under a player's name: Matches, Champions and
// Insights, as one even bar (JAS-87). Each tab is its own page, so they're
// plain links; `current` says which one is open. Ask used to be a tab here
// and now sits beside the replay on each match page; the Log is now
// Matches' By day view.
export function ProfileTabs({
  playerPath,
  current,
}: {
  playerPath: string; // e.g. "/player/na/Name-TAG"
  current: "matches" | "champions" | "insights";
}) {
  const tabs = [
    { key: "matches", label: "Matches", href: playerPath },
    { key: "champions", label: "Champions", href: `${playerPath}/champions` },
    { key: "insights", label: "Insights", href: `${playerPath}/insights` },
  ] as const;

  return (
    // The open tab's fill is `select`: over the panel it's the mockup's
    // #3a3834 in dark. Its text colour and weight mark it too, since no fill
    // this close to the panel stands out on its own.
    <nav aria-label="Profile sections" className="grid grid-cols-3 gap-1 rounded-md bg-panel p-1">
      {tabs.map((tab) => {
        const active = tab.key === current;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`flex h-11 items-center justify-center rounded-md text-body ${hoverFade} ${
              active ? "bg-select font-semibold text-main" : "font-medium text-quiet"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
