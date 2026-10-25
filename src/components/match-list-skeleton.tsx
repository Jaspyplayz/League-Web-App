import { Panel } from "@/components/ui/panel";

// Grey rows shown while the recent matches load, so the page doesn't jump
// from a line of text to a full list. The pulse stops when the player has
// asked for reduced motion. `quiet` is for a parent skeleton that already
// has its own loading label.
export function MatchListSkeleton({ quiet = false }: { quiet?: boolean }) {
  return (
    <div
      className={`flex flex-col gap-3 ${quiet ? "" : "motion-safe:animate-pulse"}`}
      {...(quiet ? { "aria-hidden": true } : { role: "status" as const, "aria-busy": true, "aria-label": "Loading matches" })}
    >
      {quiet ? null : <span className="sr-only">Loading matches</span>}
      {Array.from({ length: 5 }).map((_, i) => (
        <Panel key={i} className="flex h-20 items-center gap-4 p-4">
          <div className="size-12 rounded-lg bg-line-strong" />
          <div className="flex flex-col gap-2">
            <div className="h-3 w-24 rounded bg-line-strong" />
            <div className="h-3 w-40 rounded bg-line-strong" />
          </div>
        </Panel>
      ))}
    </div>
  );
}
