import "server-only";

import { saveCooldown, waitTimeFor } from "./rate-limit-store";

// Every request to Riot goes through riotGet(). It waits its turn under
// Riot's rate limit, adds the API key, retries when Riot's servers hiccup,
// and turns failures into a RiotApiError the UI can explain. The "server-only" import above makes the build fail if a
// browser component ever imports this file, so the key can't leak.

export type RiotErrorKind =
  | "not-found" // 404: no such player or match
  | "rate-limited" // 429: we used up our request allowance for now
  | "bad-key" // 401/403 or no key set: the key is missing or expired
  | "unavailable"; // 5xx, timeouts, network errors, anything unexpected

export class RiotApiError extends Error {
  constructor(
    readonly kind: RiotErrorKind,
    message: string,
    // Seconds to wait before trying again, for "rate-limited".
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = "RiotApiError";
  }
}

const TIMEOUT_MS = 8_000;
// Waits between attempts when Riot returns a 5xx or the request fails.
const RETRY_DELAYS_MS = [250, 1_000];
// Riot sometimes omits Retry-After; this is the fallback.
const DEFAULT_RETRY_AFTER_S = 10;
// The longest a request waits for its turn under the rate limit. Waiting out
// a full second is fine for a page; waiting out a 2 minute window isn't, so
// past this the request fails as "rate-limited" and the page says when to
// try again.
const MAX_WAIT_MS = 2_000;

// Until when this server shouldn't call each host, because Riot said "slow
// down" or the shared count (rate-limit-store.ts) said the window is full.
// Riot can disable keys that keep calling after a 429. This is only a fast
// path that saves a database trip: the shared count is what keeps every
// server on Vercel inside the limit together.
const cooldownUntil = new Map<string, number>();

export async function riotGet<T>(host: string, path: string): Promise<T> {
  const key = process.env.RIOT_API_KEY;
  if (!key) {
    throw new RiotApiError("bad-key", "RIOT_API_KEY is not set");
  }

  const pausedUntil = cooldownUntil.get(host) ?? 0;
  if (Date.now() < pausedUntil) {
    const wait = Math.ceil((pausedUntil - Date.now()) / 1000);
    throw new RiotApiError("rate-limited", `Cooling down for ${wait}s`, wait);
  }

  const url = `https://${host}.api.riotgames.com${path}`;

  for (let attempt = 0; ; attempt++) {
    // Every attempt is a request Riot counts, retries included.
    await waitForTurn(host);

    let res: Response;
    try {
      res = await fetch(url, {
        headers: { "X-Riot-Token": key },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (cause) {
      // Network error or timeout: worth another try.
      if (attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }
      throw new RiotApiError("unavailable", `Request to ${host} failed: ${String(cause)}`);
    }

    if (res.ok) return (await res.json()) as T;

    if (res.status >= 500 && attempt < RETRY_DELAYS_MS.length) {
      await sleep(RETRY_DELAYS_MS[attempt]);
      continue;
    }

    const error = toError(host, res);
    if (error.kind === "rate-limited") {
      // Tell the other servers too, so none of them calls before Riot is ready.
      await saveCooldown(host, new Date(Date.now() + (error.retryAfter ?? 0) * 1000));
    }
    throw error;
  }
}

// Waits until the shared count lets one more request go to `host`. Short
// waits (the per-second limit) are slept through; a long one throws.
async function waitForTurn(host: string) {
  let waited = 0;
  for (;;) {
    const wait = await waitTimeFor(host);
    if (wait === 0) return;
    if (waited + wait > MAX_WAIT_MS) {
      cooldownUntil.set(host, Date.now() + wait);
      throw new RiotApiError(
        "rate-limited",
        `Used up the request allowance for ${host}`,
        Math.ceil(wait / 1000),
      );
    }
    await sleep(wait);
    waited += wait;
  }
}

function toError(host: string, res: Response): RiotApiError {
  switch (res.status) {
    case 404:
      return new RiotApiError("not-found", "Not found");
    case 401:
    case 403:
      return new RiotApiError("bad-key", `Riot rejected the API key (${res.status})`);
    case 429: {
      const header = Number(res.headers.get("Retry-After"));
      const retryAfter = header > 0 ? header : DEFAULT_RETRY_AFTER_S;
      cooldownUntil.set(host, Date.now() + retryAfter * 1000);
      return new RiotApiError("rate-limited", "Rate limited by Riot", retryAfter);
    }
    default:
      return new RiotApiError("unavailable", `Riot returned ${res.status}`);
  }
}

// Waits for a Riot call and reports how it went instead of throwing, so a page
// can show a friendly message for expected failures. Anything that isn't a
// RiotApiError is a bug, so it's rethrown for the error page to catch.
export async function settle<T>(
  promise: Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; error: RiotApiError }> {
  try {
    return { ok: true, value: await promise };
  } catch (error) {
    if (error instanceof RiotApiError) return { ok: false, error };
    throw error;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// For tests: forget any cooldowns from earlier tests.
export function resetCooldowns() {
  cooldownUntil.clear();
}
