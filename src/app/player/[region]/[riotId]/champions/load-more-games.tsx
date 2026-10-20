"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

// "Load 10 more games" above the Champions table. The server loads a few
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
    <div className="flex items-center gap-3">
      {busy && <span className="text-note text-faint">Riot is busy, try again in a minute.</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => router.refresh())}
        className="hud-cut-sm border border-frame bg-surface px-3 py-1.5 text-note font-medium text-ink-soft transition-colors hover:bg-surface-hover hover:text-ink disabled:opacity-60"
      >
        {pending ? "Loading…" : `Load ${count} more games`}
      </button>
    </div>
  );
}
