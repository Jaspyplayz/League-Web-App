import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// "server-only" throws when imported outside Next.js's server build. Tests run
// in plain Node, so swap it for an empty module.
vi.mock("server-only", () => ({}));

const { RiotApiError, riotGet, resetCooldowns, settle } = await import("./client");

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubEnv("RIOT_API_KEY", "RGAPI-test");
  vi.stubGlobal("fetch", fetchMock);
  vi.useFakeTimers();
  resetCooldowns();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

function respond(status: number, body: unknown = {}, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers });
}

// Runs riotGet while fast-forwarding through its retry waits.
async function call(host = "americas", path = "/x") {
  const promise = riotGet(host, path);
  promise.catch(() => {}); // the test inspects the rejection itself
  await vi.runAllTimersAsync();
  return promise;
}

describe("riotGet", () => {
  it("sends the key to the right host and returns the JSON", async () => {
    fetchMock.mockResolvedValueOnce(respond(200, { puuid: "abc" }));

    await expect(call("americas", "/riot/account/v1/x")).resolves.toEqual({ puuid: "abc" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://americas.api.riotgames.com/riot/account/v1/x");
    expect(new Headers(init?.headers).get("X-Riot-Token")).toBe("RGAPI-test");
  });

  it("fails without calling Riot when no key is set", async () => {
    vi.stubEnv("RIOT_API_KEY", "");
    await expect(call()).rejects.toMatchObject({ kind: "bad-key" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [404, "not-found"],
    [401, "bad-key"],
    [403, "bad-key"],
    [400, "unavailable"],
  ])("turns a %i into %s", async (status, kind) => {
    fetchMock.mockResolvedValueOnce(respond(status));
    await expect(call()).rejects.toMatchObject({ kind });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries server errors, then succeeds", async () => {
    fetchMock.mockResolvedValueOnce(respond(503)).mockResolvedValueOnce(respond(200, [1]));
    await expect(call()).resolves.toEqual([1]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after three attempts", async () => {
    fetchMock.mockImplementation(async () => respond(500));
    await expect(call()).rejects.toMatchObject({ kind: "unavailable" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("retries network errors", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    fetchMock.mockResolvedValueOnce(respond(200, "ok"));
    await expect(call()).resolves.toBe("ok");
  });

  it("on a 429, reports Retry-After and pauses that host only", async () => {
    fetchMock.mockResolvedValueOnce(respond(429, {}, { "Retry-After": "30" }));
    await expect(call("americas")).rejects.toMatchObject({
      kind: "rate-limited",
      retryAfter: 30,
    });

    // Same host: refused locally without calling Riot.
    await expect(call("americas")).rejects.toMatchObject({ kind: "rate-limited" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Another host is unaffected.
    fetchMock.mockResolvedValueOnce(respond(200, "europe ok"));
    await expect(call("europe")).resolves.toBe("europe ok");

    // After the pause, the first host works again.
    vi.advanceTimersByTime(30_000);
    fetchMock.mockResolvedValueOnce(respond(200, "back"));
    await expect(call("americas")).resolves.toBe("back");
  });
});

describe("settle", () => {
  it("wraps Riot errors and passes values through", async () => {
    await expect(settle(Promise.resolve(1))).resolves.toEqual({ ok: true, value: 1 });
    const error = new RiotApiError("not-found", "nope");
    await expect(settle(Promise.reject(error))).resolves.toEqual({ ok: false, error });
  });

  it("rethrows anything else, since that's a bug", async () => {
    await expect(settle(Promise.reject(new TypeError("bug")))).rejects.toThrow("bug");
  });
});
