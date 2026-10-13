"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// How long to wait before asking the server for the next batch of games.
const NEXT_BATCH_MS = 1_000;
// If a reload brings no new games for this long, stop and offer a button.
const GIVE_UP_MS = 20_000;

// "Analyzed 8 of 18 games" while the insights page is still filling in. The
// server analyzes a few more games on every page load, so this reloads the
// page's data (without a full browser reload) until every game is in.
// router.refresh() re-runs the Server Components and swaps in the new
// result, keeping this component and its state.
export function AnalysisProgress({
  analyzed,
  total,
  retryAfterS,
  whose = "your games",
}: {
  analyzed: number;
  total: number;
  // Whose games are loading, e.g. "your and Faker's games".
  whose?: string;
  // Set when Riot asked us to slow down: wait this long before the next try.
  retryAfterS: number | null;
}) {
  const router = useRouter();
  const [stalled, setStalled] = useState(false);
  // Bumped by "Try again" so the effect below runs again.
  const [attempt, setAttempt] = useState(0);

  // Runs again whenever a reload brings new games (analyzed changes). If one
  // doesn't, nothing re-runs, so the give-up timer fires.
  useEffect(() => {
    if (analyzed >= total) return;
    const delay = retryAfterS ? retryAfterS * 1000 : NEXT_BATCH_MS;
    const next = setTimeout(() => router.refresh(), delay);
    const giveUp = setTimeout(() => setStalled(true), delay + GIVE_UP_MS);
    return () => {
      clearTimeout(next);
      clearTimeout(giveUp);
    };
  }, [analyzed, total, retryAfterS, attempt, router]);

  const pct = total > 0 ? (analyzed / total) * 100 : 0;

  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-[14px] border border-line-strong bg-surface px-5 py-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">
          {stalled
            ? `Riot isn't sending the rest of ${whose} right now`
            : `Analyzing ${whose}: ${analyzed} of ${total} done`}
        </p>
        {stalled && (
          <button
            type="button"
            onClick={() => {
              setStalled(false);
              setAttempt((a) => a + 1);
            }}
            className="min-h-10 rounded-lg border border-line-strong px-3.5 text-sm hover:bg-line"
          >
            Try again
          </button>
        )}
      </div>
      <div className="h-1.5 rounded-sm bg-line" aria-hidden="true">
        <div className="h-1.5 rounded-sm bg-ahead transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-sm text-muted">
        {stalled
          ? "The insights below use the games analyzed so far."
          : "Each game's minute-by-minute timeline comes from Riot once, then it's saved. Your trends fill in as games come in."}
      </p>
    </div>
  );
}
