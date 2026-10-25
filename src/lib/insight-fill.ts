// How Insights decides the next batch. The page renders whatever is already
// saved. A separate action asks Riot for the next handful, then the bar
// moves from that result. The route refreshes only when the counts changed,
// so the charts catch up without a timer reloading the page.

export type FillCounts = {
  analyzed: number;
  total: number;
  // Seconds Riot asked us to wait, or null when the last batch was fine.
  retryAfterS: number | null;
};

// One second between batches. Long enough that a save is visible to the next
// read, short enough that a 20-game window doesn't feel stuck.
export const NEXT_BATCH_MS = 1000;

export type BatchStep =
  | { kind: "done"; counts: FillCounts; refresh: boolean }
  | { kind: "stalled"; counts: FillCounts; refresh: false }
  | { kind: "again"; counts: FillCounts; waitMs: number; refresh: boolean };

// `before` is the bar on screen. `after` is the batch that just finished.
// A repeat of the same counts stalls, unless Riot asked us to wait and try
// again. Either way the end state depends only on those two snapshots.
export function afterBatch(before: FillCounts, after: FillCounts): BatchStep {
  const refresh = after.analyzed !== before.analyzed || after.total !== before.total;
  if (after.analyzed >= after.total) return { kind: "done", counts: after, refresh };
  if (!refresh && after.retryAfterS == null) return { kind: "stalled", counts: after, refresh: false };
  const waitMs = after.retryAfterS != null ? after.retryAfterS * 1000 : NEXT_BATCH_MS;
  return { kind: "again", counts: after, waitMs, refresh };
}

// The server render can lag a batch that was just stored. The bar keeps the
// higher count so a refresh doesn't walk it backwards.
export function mergeCounts(shown: FillCounts, server: FillCounts): FillCounts {
  if (server.analyzed < shown.analyzed) return shown;
  if (server.analyzed === shown.analyzed && server.total > shown.total) return shown;
  if (
    server.analyzed === shown.analyzed &&
    server.total === shown.total &&
    server.retryAfterS === shown.retryAfterS
  ) {
    return shown;
  }
  return server;
}

// One bar for every player on the page (you, and someone you compare with).
export function fillCounts(
  parts: { analyzed: number; waiting: number; retryAfterS: number | null }[],
): FillCounts {
  const analyzed = parts.reduce((sum, part) => sum + part.analyzed, 0);
  const waiting = parts.reduce((sum, part) => sum + part.waiting, 0);
  const retryAfterS = parts.find((part) => part.retryAfterS != null)?.retryAfterS ?? null;
  return { analyzed, total: analyzed + waiting, retryAfterS };
}

export type AdvanceResult =
  | { status: "ready"; counts: FillCounts }
  | { status: "pause"; retryAfterS: number | null };
