import { MatchListSkeleton } from "@/components/match-list-skeleton";
import { LoadingBlock, LoadingStatus } from "@/components/ui/loading";
import { panelClass } from "@/components/ui/panel";

// The profile while the player is looked up (JAS-93's states canvas): the
// top, the tabs and the Matches grid as grey blocks in their real shapes, so
// nothing jumps when the profile arrives, under one status line saying who's
// being looked up. The tab names are already known, so they show for real.
export function ProfileSkeleton({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-6">
      <div role="status">
        <LoadingStatus label={label} />
      </div>

      <div aria-hidden="true" className="flex items-center gap-5 motion-safe:animate-pulse">
        <LoadingBlock className="size-[88px] shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <LoadingBlock className="h-8 w-full max-w-72" />
          <LoadingBlock className="h-4 w-full max-w-56" />
          <div className="mt-1 flex gap-2">
            <LoadingBlock className="h-10 w-28" />
            <LoadingBlock className="h-10 w-28" />
            <LoadingBlock className="size-10" />
          </div>
        </div>
      </div>

      <div aria-hidden="true" className="grid grid-cols-3 gap-1 rounded-md bg-panel p-1">
        {["Matches", "Champions", "Insights"].map((tab, i) => (
          <span
            key={tab}
            className={`flex h-11 items-center justify-center rounded-md text-body ${
              i === 0 ? "bg-select font-semibold text-main" : "font-medium text-quiet"
            }`}
          >
            {tab}
          </span>
        ))}
      </div>

      <div
        aria-hidden="true"
        className="grid grid-cols-1 items-start gap-[18px] motion-safe:animate-pulse lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-x-6"
      >
        <RankSkeleton />
        <div className="flex min-w-0 flex-col gap-3.5">
          <LoadingBlock className="h-9 w-full max-w-lg" />
          <div className={`${panelClass} h-[104px]`} />
          <MatchListSkeleton quiet />
        </div>
      </div>
    </div>
  );
}

// The Ranked Solo/Duo panel in grey, here and while the saved rank history
// loads on the profile itself. The caller makes it pulse.
export function RankSkeleton() {
  return (
    <div aria-hidden="true" className={`${panelClass} flex flex-col gap-3 px-[18px] py-4`}>
      <LoadingBlock className="h-3.5 w-28" />
      <div className="flex items-center gap-3">
        <LoadingBlock className="size-12 shrink-0" />
        <LoadingBlock className="h-5 flex-1" />
      </div>
    </div>
  );
}
