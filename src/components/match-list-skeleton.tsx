import { Panel } from "@/components/ui/panel";

// Grey rows shown while ... so the page doesn't ...
export function MatchListSkeleton() {
  return (
    <div className="flex flex-col gap-3 animate-pulse">
      {Array.from({ length: 5 }).map((_, i) => (
        <Panel key={i} className="flex items-center gap-4 h-20 p-4">
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