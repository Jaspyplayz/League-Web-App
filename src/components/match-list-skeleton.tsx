import { Panel } from "@/components/ui/panel";

// `quiet` drops the loading label. A parent skeleton already announces the wait.
export function MatchListSkeleton({ quiet = false }: { quiet?: boolean }) {
  return (
    <div
      className={`flex flex-col gap-3 ${quiet ? "" : "motion-safe:animate-pulse"}`}
      {...(quiet ? { "aria-hidden": true } : { role: "status" as const, "aria-busy": true, "aria-label": "Loading matches" })}
    >
      {quiet ? null : <span className="sr-only">Loading matches</span>}
      {Array.from({ length: 5 }).map((_, i) => (
        <Panel key={i} className="flex h-20 items-center gap-4 p-4">
          <div className="soft-round-sm size-12 bg-line-strong" />
          <div className="flex flex-col gap-2">
            <div className="h-3 w-24 rounded bg-line-strong" />
            <div className="h-3 w-40 rounded bg-line-strong" />
          </div>
        </Panel>
      ))}
    </div>
  );
}
