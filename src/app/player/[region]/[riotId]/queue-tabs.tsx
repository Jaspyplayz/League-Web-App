import Link from "next/link";
import { hoverFade } from "@/components/header-style";
import { QUEUE_FILTERS, type QueueFilter } from "@/lib/queue-filters";

// Matches has two views of the same games: List (one row per game) and By
// day (one card per day, which used to be the Log tab). The view lives in the
// URL as ?view=day, so it can be shared and reloaded; List needs nothing.
export type MatchesView = "list" | "day";

export function readMatchesView(value: string | string[] | undefined): MatchesView {
  return value === "day" ? "day" : "list";
}

// The address of one queue and view. Each link keeps the other choice, so
// picking a queue in By day stays in By day, and switching view keeps the
// queue. `defaultId` is the queue the page opens on, which needs no ?queue=.
export function matchesHref(
  playerPath: string,
  queue: QueueFilter["id"],
  view: MatchesView,
  defaultId: QueueFilter["id"] = "all",
): string {
  const query = new URLSearchParams();
  if (queue !== defaultId) query.set("queue", queue);
  if (view === "day") query.set("view", "day");
  return query.size > 0 ? `${playerPath}?${query}` : playerPath;
}

// The game-mode choices above the games. Plain links, so the server renders
// the filtered games and the URL can be shared. Champions uses them without
// a view.
export function QueueTabs({
  playerPath,
  current,
  defaultId = "all",
  view = "list",
}: {
  playerPath: string; // the page the tabs link to, e.g. "/player/na/Name-TAG"
  current: QueueFilter;
  // The tab the page opens on, which needs no ?queue= in its link.
  defaultId?: QueueFilter["id"];
  view?: MatchesView;
}) {
  return (
    // On phones the choices scroll sideways in one line, as in the mockup;
    // wider screens wrap them.
    <nav aria-label="Game mode" className="flex min-w-0 max-w-full gap-1 overflow-x-auto sm:flex-wrap sm:overflow-visible">
      {QUEUE_FILTERS.map((f) => {
        const active = f.id === current.id;
        return (
          <Link
            key={f.id}
            href={matchesHref(playerPath, f.id, view, defaultId)}
            // Keep the page where it is, since the tabs sit below the header.
            scroll={false}
            aria-current={active ? "page" : undefined}
            className={`flex h-11 shrink-0 items-center whitespace-nowrap rounded-md px-3 text-note sm:h-8 ${hoverFade} ${
              active ? "bg-panel font-semibold text-main" : "text-quiet"
            }`}
          >
            {f.label}
          </Link>
        );
      })}
    </nav>
  );
}

// The queue choices with the List / By day switch beside them, at the top of
// Matches in both views.
export function MatchesControls({
  playerPath,
  queue,
  view,
}: {
  playerPath: string;
  queue: QueueFilter;
  view: MatchesView;
}) {
  const views = [
    { id: "list", label: "List" },
    { id: "day", label: "By day" },
  ] as const;
  return (
    // On phones the switch sits above the queue choices; on wider screens it
    // moves to their right.
    <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
      <nav aria-label="Matches view" className="flex shrink-0 rounded-md bg-panel p-1 sm:order-last">
        {views.map((v) => (
          <Link
            key={v.id}
            href={matchesHref(playerPath, queue.id, v.id)}
            scroll={false}
            aria-current={v.id === view ? "page" : undefined}
            // 44px tall on phones with the padding, so it's easy to tap.
            className={`flex h-9 items-center rounded-sm px-3 text-note sm:h-7 ${hoverFade} ${
              v.id === view ? "bg-select font-semibold text-main" : "text-quiet"
            }`}
          >
            {v.label}
          </Link>
        ))}
      </nav>
      <QueueTabs playerPath={playerPath} current={queue} view={view} />
    </div>
  );
}
