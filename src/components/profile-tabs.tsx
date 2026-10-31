import Link from "next/link";

// "Matches | Champions | Insights | Log" tabs under a player's name. Each tab is its own page,
// so they're plain links; `current` says which one is open. Ask used to be a
// tab here; it now sits beside the replay on each match page.
export function ProfileTabs({
  playerPath,
  current,
}: {
  playerPath: string; // e.g. "/player/na/Name-TAG"
  current: "matches" | "champions" | "insights" | "log";
}) {
  const tabs = [
    { key: "matches", label: "Matches", href: playerPath },
    { key: "champions", label: "Champions", href: `${playerPath}/champions` },
    { key: "insights", label: "Insights", href: `${playerPath}/insights` },
    { key: "log", label: "Log", href: `${playerPath}/log` },
  ] as const;

  return (
    <nav aria-label="Profile sections" className="flex gap-1 border-b border-divider">
      {tabs.map((tab) => {
        const active = tab.key === current;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px shrink-0 border-b-2 px-2.5 py-3 sm:px-[18px] ${
              active
                ? "border-ahead font-semibold text-main"
                : "border-transparent font-medium text-quiet hover:text-main"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
