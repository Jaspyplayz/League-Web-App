export type FillCounts = {
  analyzed: number;
  total: number;
  retryAfterS: number | null;
};

export const NEXT_BATCH_MS = 1000;

export type BatchStep =
  | { kind: "done"; counts: FillCounts; refresh: boolean }
  | { kind: "stalled"; counts: FillCounts; refresh: false }
  | { kind: "again"; counts: FillCounts; waitMs: number; refresh: boolean };

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
