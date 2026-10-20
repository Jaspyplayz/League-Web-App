import Link from "next/link";
import { QUEUE_FILTERS, type QueueFilter } from "@/lib/queue-filters";

// The game-mode tabs above the match list. Plain links that set ?queue=, so
// the server renders the filtered list and the URL can be shared.
export function QueueTabs({
  playerPath,
  current,
  defaultId = "all",
}: {
  playerPath: string; // the page the tabs link to, e.g. "/player/na/Name-TAG"
  current: QueueFilter;
  // The tab the page opens on, which needs no ?queue= in its link.
  defaultId?: QueueFilter["id"];
}) {
  return (
    <nav aria-label="Game mode" className="flex flex-wrap gap-1.5">
      {QUEUE_FILTERS.map((f) => {
        const active = f.id === current.id;
        return (
          <Link
            key={f.id}
            href={f.id === defaultId ? playerPath : `${playerPath}?queue=${f.id}`}
            // Keep the page where it is, since the tabs sit below the header.
            scroll={false}
            aria-current={active ? "page" : undefined}
            className={`rounded-full border px-3 py-1 text-[13px] transition-colors ${
              active
                ? "border-ahead bg-ahead/15 font-semibold text-ink"
                : "border-line-strong text-faint hover:text-ink"
            }`}
          >
            {f.label}
          </Link>
        );
      })}
    </nav>
  );
}
