import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ASK_TIME_LIMIT_MS } from "@/lib/ask";
import { getAccount } from "@/lib/riot/api";
import { waitTimeFor } from "@/lib/riot/rate-limit-store";

// Vercel stops an Ask question at the match page's maxDuration, so
// answerQuestion stops itself at ASK_TIME_LIMIT_MS and its cost gets saved
// first (docs/ask.md, "The time limit"). Its clock starts only after the Ask
// button has looked the player up on Riot (askAction in
// src/app/account/actions.ts). So what's left of maxDuration has to cover
// that lookup at its slowest, plus the sign-in check and saving the cost.
// This times the real Riot client with Riot not answering and the rate limit
// full, so a longer Riot timeout or another retry fails here. The waits for a
// turn, and how long each rate-limit check takes, come from the mock below,
// so a longer cap on waiting (MAX_WAIT_MS in client.ts) doesn't.

vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
// What ask.ts needs only to answer questions, which this test doesn't.
vi.mock("@/lib/mcp/tools", () => ({ MAX_RECENT_GAMES: 20 }));
vi.mock("@/lib/mcp/answers", () => ({ riotErrorMessage: () => "" }));
vi.mock("@/lib/riot/rate-limit-store", () => ({ waitTimeFor: vi.fn(), saveCooldown: vi.fn() }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("RIOT_API_KEY", "test-key");
  // The client gives each request an AbortSignal.timeout, whose timer the
  // fake clock doesn't drive, so put it on the fake clock.
  vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
    const stop = new AbortController();
    setTimeout(() => stop.abort(new DOMException("timed out", "TimeoutError")), ms);
    return stop.signal;
  });
  // Riot never answers: each request waits until its timeout stops it.
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(init.signal?.reason))),
    ),
  );
  // The shared rate limit is full. Each check takes a second (the store gives
  // up on the database after that) and says to wait a second, twice, before
  // it lets the request go: two seconds of waiting, the client's cap today.
  let check = 0;
  vi.mocked(waitTimeFor).mockImplementation(
    () => new Promise((resolve) => setTimeout(() => resolve([1000, 1000, 0][check++ % 3]), 1000)),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("leaves room in the match page's maxDuration for the slowest Riot lookup, and saving", async () => {
  const start = Date.now();
  const lookup = getAccount("na", { gameName: "Jaspy", tagLine: "CA1" }).catch(() => "failed");
  await vi.runAllTimersAsync();
  expect(await lookup).toBe("failed");
  const lookupMs = Date.now() - start;
  // Every try the client makes really ran.
  expect(fetch).toHaveBeenCalledTimes(3);

  const page = readFileSync("src/app/player/[region]/[riotId]/match/[matchId]/page.tsx", "utf8");
  const maxDuration = Number(/export const maxDuration = (\d+);/.exec(page)?.[1]) * 1000;
  // The rest is for the sign-in check before, and reserve() and settle()
  // in src/lib/ask-store.ts, each a short database call.
  expect(maxDuration - lookupMs - ASK_TIME_LIMIT_MS).toBeGreaterThanOrEqual(15_000);
});
