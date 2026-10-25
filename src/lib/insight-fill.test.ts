import { describe, expect, it } from "vitest";
import { afterBatch, fillCounts, mergeCounts, NEXT_BATCH_MS, type FillCounts } from "./insight-fill";

const at = (analyzed: number, total: number, retryAfterS: number | null = null): FillCounts => ({
  analyzed,
  total,
  retryAfterS,
});

describe("afterBatch", () => {
  it("stops when every game is in, and refreshes once if this batch moved the bar", () => {
    expect(afterBatch(at(4, 8), at(8, 8))).toEqual({
      kind: "done",
      counts: at(8, 8),
      refresh: true,
    });
    const caughtUp = afterBatch(at(8, 8), at(8, 8));
    expect(caughtUp.kind).toBe("done");
    if (caughtUp.kind !== "done") return;
    expect(caughtUp.refresh).toBe(false);
  });

  it("waits a second and refreshes the charts when the batch stored new games", () => {
    expect(afterBatch(at(3, 10), at(8, 10))).toEqual({
      kind: "again",
      counts: at(8, 10),
      waitMs: NEXT_BATCH_MS,
      refresh: true,
    });
    expect(NEXT_BATCH_MS).toBe(1000);
  });

  it("stalls when a batch changes nothing, so the page is not asked again", () => {
    expect(afterBatch(at(3, 10), at(3, 10))).toEqual({
      kind: "stalled",
      counts: at(3, 10),
      refresh: false,
    });
  });

  it("waits out a rate limit even when the counts did not move, and does not refresh", () => {
    expect(afterBatch(at(3, 10), at(3, 10, 12))).toEqual({
      kind: "again",
      counts: at(3, 10, 12),
      waitMs: 12_000,
      refresh: false,
    });
  });

  it("refreshes when the total shrinks, which happens once a non-Rift game is identified", () => {
    const step = afterBatch(at(5, 12), at(5, 9));
    expect(step.kind).toBe("again");
    if (step.kind !== "again") return;
    expect(step.refresh).toBe(true);
  });
});

describe("mergeCounts", () => {
  it("keeps the bar the action already moved ahead of a lagging server render", () => {
    const shown = at(8, 10);
    expect(mergeCounts(shown, at(5, 10))).toBe(shown);
  });

  it("keeps a smaller total the action already learned", () => {
    const shown = at(5, 9);
    expect(mergeCounts(shown, at(5, 12))).toBe(shown);
  });

  it("adopts the server once it catches up, including a smaller total", () => {
    expect(mergeCounts(at(5, 12), at(8, 10))).toEqual(at(8, 10));
    expect(mergeCounts(at(5, 12), at(5, 9))).toEqual(at(5, 9));
  });

  it("returns the same object when nothing changed", () => {
    const shown = at(4, 8);
    expect(mergeCounts(shown, at(4, 8))).toBe(shown);
  });
});

describe("fillCounts", () => {
  it("adds both players and keeps the first rate-limit wait", () => {
    expect(
      fillCounts([
        { analyzed: 4, waiting: 6, retryAfterS: null },
        { analyzed: 1, waiting: 3, retryAfterS: 9 },
      ]),
    ).toEqual(at(5, 14, 9));
  });
});
