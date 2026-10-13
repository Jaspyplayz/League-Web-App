import { describe, expect, it } from "vitest";
import { mapWithLimit } from "./concurrency";

describe("mapWithLimit", () => {
  it("keeps the input order and never runs more than the limit at once", async () => {
    let running = 0;
    let peak = 0;
    const result = await mapWithLimit([30, 10, 20, 0, 5], 2, async (ms) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, ms));
      running--;
      return ms * 2;
    });

    expect(result).toEqual([60, 20, 40, 0, 10]);
    expect(peak).toBe(2);
  });

  it("handles an empty list", async () => {
    await expect(mapWithLimit([], 5, async (x) => x)).resolves.toEqual([]);
  });

  it("rejects if any call fails", async () => {
    await expect(
      mapWithLimit([1, 2, 3], 2, async (x) => {
        if (x === 2) throw new Error("boom");
        return x;
      }),
    ).rejects.toThrow("boom");
  });
});
