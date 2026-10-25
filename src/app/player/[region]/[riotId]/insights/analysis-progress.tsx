"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { panelClass } from "@/components/ui/panel";
import {
  afterBatch,
  mergeCounts,
  NEXT_BATCH_MS,
  type AdvanceResult,
  type FillCounts,
} from "@/lib/insight-fill";

// How long a Log reload can sit still before we stop and offer a button.
// Insights doesn't use this. Its batch tells us immediately whether it moved.
const GIVE_UP_MS = 20_000;

// "Analyzed 8 of 18 games" while games are still being stored.
//
// Insights passes `batch`. That action fetches the next handful and the bar
// updates from the result. The route refreshes only when the counts changed,
// so the charts redraw from the cache. It does not reload on a timer.
//
// The Log doesn't pass `batch`. Its page render is what fetches the next
// handful, so a refresh is still how that page moves forward.
export function AnalysisProgress({
  analyzed,
  total,
  retryAfterS,
  whose = "your games",
  batch,
}: {
  analyzed: number;
  total: number;
  // Whose games are loading, e.g. "your and Faker's games".
  whose?: string;
  // Set when Riot asked us to slow down: wait this long before the next try.
  retryAfterS: number | null;
  batch?: () => Promise<AdvanceResult>;
}) {
  const router = useRouter();
  const server: FillCounts = { analyzed, total, retryAfterS };
  // The batch can move the bar before the refreshed server render arrives.
  const [ahead, setAhead] = useState<FillCounts | null>(null);
  const [stalled, setStalled] = useState(false);
  // Bumped by "Try again" so the effect below runs again.
  const [attempt, setAttempt] = useState(0);
  // Milliseconds to wait before the next Insights batch. 0 starts at once.
  const [holdMs, setHoldMs] = useState(0);
  const running = useRef(false);
  const shown = batch && ahead ? mergeCounts(ahead, server) : server;
  const { analyzed: shownAnalyzed, total: shownTotal, retryAfterS: shownRetry } = shown;

  useEffect(() => {
    if (batch) return;
    if (analyzed >= total) return;
    const delay = retryAfterS ? retryAfterS * 1000 : NEXT_BATCH_MS;
    const next = setTimeout(() => router.refresh(), delay);
    const giveUp = setTimeout(() => setStalled(true), delay + GIVE_UP_MS);
    return () => {
      clearTimeout(next);
      clearTimeout(giveUp);
    };
  }, [batch, analyzed, total, retryAfterS, attempt, router]);

  useEffect(() => {
    if (!batch || stalled || shownAnalyzed >= shownTotal || running.current) return;
    const before: FillCounts = {
      analyzed: shownAnalyzed,
      total: shownTotal,
      retryAfterS: shownRetry,
    };
    const timer = setTimeout(() => {
      if (running.current) return;
      running.current = true;
      batch()
        .then((result) => {
          // Clear this before the state updates, so the effect that follows
          // can schedule the next batch.
          running.current = false;
          if (result.status === "pause") {
            if (result.retryAfterS == null) setStalled(true);
            else setHoldMs(result.retryAfterS * 1000);
            return;
          }
          const step = afterBatch(before, result.counts);
          setAhead(step.counts);
          if (step.refresh) router.refresh();
          if (step.kind === "stalled") setStalled(true);
          else if (step.kind === "again") setHoldMs(step.waitMs);
        })
        .catch(() => {
          running.current = false;
          setStalled(true);
        });
    }, holdMs);
    return () => clearTimeout(timer);
  }, [batch, stalled, shownAnalyzed, shownTotal, shownRetry, holdMs, attempt, router]);

  if (batch && shown.analyzed >= shown.total) return null;

  const pct = shown.total > 0 ? (shown.analyzed / shown.total) * 100 : 0;

  return (
    <div role="status" className={`${panelClass} flex flex-col gap-3 px-5 py-4`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">
          {stalled
            ? `Riot isn't sending the rest of ${whose} right now`
            : `Analyzing ${whose}: ${shown.analyzed} of ${shown.total} done`}
        </p>
        {stalled && (
          <button
            type="button"
            onClick={() => {
              setStalled(false);
              setHoldMs(0);
              setAttempt((n) => n + 1);
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
