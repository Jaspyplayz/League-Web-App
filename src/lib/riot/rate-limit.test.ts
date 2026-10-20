import { describe, expect, it } from "vitest";
import { takeTurn, type HostState, type RateLimit } from "./rate-limit";

// Small limits keep the numbers readable: 2 per second, 3 per 10 seconds.
const LIMITS: RateLimit[] = [
  { requests: 2, seconds: 1 },
  { requests: 3, seconds: 10 },
];

// Takes `n` turns at time `now`, failing the test if any is refused.
function take(state: HostState | null, now: number, n = 1): HostState {
  for (let i = 0; i < n; i++) {
    const turn = takeTurn(state, now, LIMITS);
    if (!turn.allowed) throw new Error(`turn ${i + 1} was refused`);
    state = turn.next;
  }
  return state!;
}

describe("takeTurn", () => {
  it("lets the first request through and starts every window", () => {
    expect(takeTurn(null, 1000, LIMITS)).toEqual({
      allowed: true,
      next: {
        windows: [
          { start: 1000, count: 1 },
          { start: 1000, count: 1 },
        ],
        cooldownUntil: 0,
      },
    });
  });

  it("waits for the short window when it's full", () => {
    const state = take(null, 1000, 2);
    expect(takeTurn(state, 1400, LIMITS)).toEqual({ allowed: false, waitMs: 600 });
  });

  it("starts a new short window once the old one ends", () => {
    const state = take(null, 1000, 2);
    const turn = takeTurn(state, 2000, LIMITS);
    expect(turn.allowed).toBe(true);
    if (turn.allowed) {
      expect(turn.next.windows).toEqual([
        { start: 2000, count: 1 },
        { start: 1000, count: 3 },
      ]);
    }
  });

  it("waits for the long window even when the short one has room", () => {
    const state = take(take(null, 1000, 2), 2000);
    // 3 requests used of 3 per 10 seconds; the long window ends at 11000.
    expect(takeTurn(state, 5000, LIMITS)).toEqual({ allowed: false, waitMs: 6000 });
  });

  it("waits out a cooldown after Riot said too many requests", () => {
    const state: HostState = { windows: [], cooldownUntil: 9000 };
    expect(takeTurn(state, 4000, LIMITS)).toEqual({ allowed: false, waitMs: 5000 });
    expect(takeTurn(state, 9000, LIMITS).allowed).toBe(true);
  });

  it("keeps the cooldown time in the saved state", () => {
    const turn = takeTurn({ windows: [], cooldownUntil: 500 }, 1000, LIMITS);
    expect(turn.allowed && turn.next.cooldownUntil).toBe(500);
  });
});
