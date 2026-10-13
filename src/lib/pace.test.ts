import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPacer } from "./pace";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createPacer", () => {
  it("lets calls through right away until the window is full", async () => {
    const wait = createPacer(3, 1000);
    const started: number[] = [];
    for (let i = 0; i < 3; i++) {
      await wait();
      started.push(Date.now());
    }
    expect(started).toEqual([started[0], started[0], started[0]]);
  });

  it("waits for the oldest call to leave the window", async () => {
    const wait = createPacer(2, 1000);
    const start = Date.now();
    await wait();
    vi.advanceTimersByTime(300);
    await wait();

    let done = false;
    const third = wait().then(() => (done = true));
    await vi.advanceTimersByTimeAsync(699);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await third;
    expect(Date.now() - start).toBe(1000);
  });

  it("never lets more than the limit through in any window", async () => {
    const wait = createPacer(5, 1000);
    const times: number[] = [];
    const all = Array.from({ length: 12 }, () => wait().then(() => times.push(Date.now())));
    await vi.runAllTimersAsync();
    await Promise.all(all);

    for (const t of times) {
      const inWindow = times.filter((u) => u >= t && u < t + 1000).length;
      expect(inWindow).toBeLessThanOrEqual(5);
    }
    expect(times).toHaveLength(12);
  });
});
