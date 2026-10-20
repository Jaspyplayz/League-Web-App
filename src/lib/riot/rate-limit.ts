// Riot allows each API key a fixed number of requests per region in each
// time window. These are the limits for a development or personal key; a
// production key allows more, so change them when the key changes. The
// numbers come back on every Riot response in the X-App-Rate-Limit header
// ("20:1,100:120" means 20 per second and 100 per 2 minutes).
export const RIOT_LIMITS: readonly RateLimit[] = [
  { requests: 20, seconds: 1 },
  { requests: 100, seconds: 120 },
];

export type RateLimit = { requests: number; seconds: number };

// How many requests went out in one window, and when that window began.
// Riot starts a window at the first request, not on the clock, so this does
// the same.
export type WindowCount = { start: number; count: number };

// Everything the limiter remembers about one Riot host ("na1", "americas").
// Times are milliseconds since 1970, like Date.now().
export type HostState = {
  // One entry per limit in RIOT_LIMITS, in the same order.
  windows: WindowCount[];
  // After Riot answers "too many requests", nobody calls this host before
  // this time.
  cooldownUntil: number;
};

export type Turn =
  // Go ahead, and save `next` as the host's new state.
  | { allowed: true; next: HostState }
  // Don't call Riot yet: wait this many milliseconds and ask again.
  | { allowed: false; waitMs: number };

// Decides whether one more request to a host fits inside every limit.
// Pure, so the rules can be tested without a database: the caller loads the
// state, asks here, and saves `next` only when the request is allowed.
export function takeTurn(
  state: HostState | null,
  now: number,
  limits: readonly RateLimit[] = RIOT_LIMITS,
): Turn {
  let waitMs = Math.max(0, (state?.cooldownUntil ?? 0) - now);

  const windows = limits.map((limit, i) => {
    const length = limit.seconds * 1000;
    const window = state?.windows[i];
    // No window yet, or the last one has ended: this request starts a new one.
    if (!window || now >= window.start + length) return { start: now, count: 0 };
    if (window.count >= limit.requests) {
      waitMs = Math.max(waitMs, window.start + length - now);
    }
    return window;
  });

  if (waitMs > 0) return { allowed: false, waitMs };
  return {
    allowed: true,
    next: {
      windows: windows.map((w) => ({ start: w.start, count: w.count + 1 })),
      cooldownUntil: state?.cooldownUntil ?? 0,
    },
  };
}
