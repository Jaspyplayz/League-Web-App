import { LoadingBlock, LoadingSection } from "@/components/ui/loading";

// The game rows while they load: grey blocks in each row's shape (the
// champion, its name, the KDA and the score) and about its height (the five
// player names set it on wider screens), so little jumps when they arrive.
// `quiet` drops the status line, for when a parent skeleton already says
// what's loading.
export function MatchListSkeleton({ quiet = false }: { quiet?: boolean }) {
  const rows = (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex h-[92px] items-center gap-3 rounded-md bg-panel px-3.5 sm:h-[114px]">
          <LoadingBlock className="hidden h-9 w-16 sm:block" />
          <LoadingBlock className="size-11 shrink-0" />
          <div className="flex flex-1 flex-col gap-2">
            <LoadingBlock className="h-3.5 w-24" />
            <LoadingBlock className="h-3 w-16" />
          </div>
          <LoadingBlock className="h-8 w-10" />
        </div>
      ))}
    </div>
  );
  if (quiet) {
    return (
      <div aria-hidden="true" className="motion-safe:animate-pulse">
        {rows}
      </div>
    );
  }
  return <LoadingSection label="Loading games">{rows}</LoadingSection>;
}
