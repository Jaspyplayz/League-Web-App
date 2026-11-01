"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

// "Load 10 more games" in the Champions panel, or in its empty panel when
// none of the games loaded so far are in the picked mode. The server loads a few
// more of the season's games on every page load, so this just asks it to
// render the page again: router.refresh() re-runs the Server Components and
// swaps in the new table without a full browser reload.
//
// There's no automatic loop, unlike Insights: a season can be hundreds of
// games, and loading them all at once would use up the Riot key's allowance
// for everyone else on the site.
export function LoadMoreGames({ count, busy }: { count: number; busy: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-3">
      {busy && <span className="text-note text-quiet">Riot is busy, try again in a minute.</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => router.refresh())}
        className="inline-flex h-10 items-center rounded-md bg-raised px-4 text-note font-medium text-main hover:bg-divider disabled:opacity-60 max-sm:h-11"
      >
        {pending ? "Loading…" : `Load ${count} more games`}
      </button>
    </div>
  );
}
