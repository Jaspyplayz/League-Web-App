import { EventEmitter } from "node:events";
import type { BrowserContext, Request } from "@playwright/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { recordLeaks, recordSent } from "../e2e/preview-login";

// These live here because Vitest skips e2e/, and Playwright would run a
// .test.ts file placed there as a browser test.

const PREVIEW = "https://preview.example";
const OTHER = "https://other.example";
const SECRET = { "x-vercel-protection-bypass": "value" };
const CLOSED = "request.allHeaders: Target page, context or browser has been closed";

function fakeContext() {
  const events = new EventEmitter();
  return {
    context: events as unknown as BrowserContext,
    finish: (request: Request) => events.emit("requestfinished", request),
    start: (request: Request) => events.emit("request", request),
  };
}

function fakeRequest(url: string, allHeaders: () => Promise<Record<string, string>>, redirectedFrom: Request | null = null) {
  return { url: () => url, allHeaders: vi.fn(allHeaders), redirectedFrom: () => redirectedFrom } as unknown as Request;
}

const sentWith = (headers: Record<string, string>) => () => Promise.resolve(headers);
const closedBrowser = () => Promise.reject(new Error(CLOSED));

// A redirect chain through these addresses, returning its last hop. The hops
// reject if read, since a hop may still be running as the browser closes.
function chain(...urls: string[]) {
  return urls.reduce<Request | null>((from, url) => fakeRequest(url, closedBrowser, from), null)!;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("recordLeaks", () => {
  it("names other sites that got the secret, and only those", async () => {
    const { context, finish } = fakeContext();
    const leaked = recordLeaks(context, PREVIEW);

    finish(fakeRequest(`${PREVIEW}/`, sentWith(SECRET)));
    finish(fakeRequest(`${OTHER}/image.png`, sentWith({})));
    finish(fakeRequest(`${OTHER}/redirected`, sentWith(SECRET)));

    await expect(leaked()).resolves.toEqual([OTHER]);
  });

  it("waits for a read that's still running when the check starts", async () => {
    const { context, finish } = fakeContext();
    const leaked = recordLeaks(context, PREVIEW);
    let answer: (headers: Record<string, string>) => void = () => {};
    finish(fakeRequest(`${OTHER}/redirected`, () => new Promise((resolve) => (answer = resolve))));

    const check = leaked();
    answer(SECRET);

    await expect(check).resolves.toEqual([OTHER]);
  });

  it("fails the check when a read it's waiting for rejects", async () => {
    const { context, finish } = fakeContext();
    const leaked = recordLeaks(context, PREVIEW);

    finish(fakeRequest(`${OTHER}/redirected`, closedBrowser));

    await expect(leaked()).rejects.toThrow(CLOSED);
  });

  // Playwright closes the browser right after the check. Reading a request
  // that finishes in that gap rejects with nobody waiting, and Playwright
  // fails the test for that (JAS-141).
  it("starts no read for a request that finishes after the check starts", async () => {
    const { context, finish } = fakeContext();
    const leaked = recordLeaks(context, PREVIEW);
    const check = leaked();

    // In the same step as the check starting, so there's no gap to finish in.
    const late = fakeRequest(`${OTHER}/image.png`, closedBrowser);
    finish(late);
    await check;

    expect(late.allHeaders).not.toHaveBeenCalled();
  });

  describe("with a secret set", () => {
    const withSecret = () => vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", "value");

    // Nothing finishes here, as when the last hop fails or never answers.
    it("names a site a redirect from the preview goes to, as soon as it starts", async () => {
      withSecret();
      const { context, start } = fakeContext();
      const leaked = recordLeaks(context, PREVIEW);
      const hop = chain(`${PREVIEW}/go`, `${OTHER}/hanging`);

      start(hop);

      await expect(leaked()).resolves.toEqual([OTHER]);
      expect(hop.allHeaders).not.toHaveBeenCalled();
    });

    it.each([
      ["through the preview first", [`${PREVIEW}/go`, `${PREVIEW}/again`, `${OTHER}/hanging`]],
      ["and back to the preview", [`${PREVIEW}/go`, `${OTHER}/back`]],
    ])("follows a chain %s", async (_, urls) => {
      withSecret();
      const { context, start } = fakeContext();
      const leaked = recordLeaks(context, PREVIEW);

      start(chain(...urls));

      await expect(leaked()).resolves.toEqual([OTHER]);
    });

    it("names a site once when the redirect is also read as finished", async () => {
      withSecret();
      const { context, start, finish } = fakeContext();
      const leaked = recordLeaks(context, PREVIEW);
      const hop = fakeRequest(`${OTHER}/done`, sentWith(SECRET), fakeRequest(`${PREVIEW}/go`, closedBrowser));

      start(hop);
      finish(hop);

      await expect(leaked()).resolves.toEqual([OTHER]);
    });

    // The route runs only on a chain's first request, so none of these has the
    // secret, as the browser run in JAS-142 measured for each shape.
    it.each([
      ["a request to another site", [`${OTHER}/image.png`]],
      ["a redirect that stays on the preview", [`${PREVIEW}/go`, `${PREVIEW}/there`]],
      ["a redirect that stays on another site", [`${OTHER}/go`, `${OTHER}/there`]],
      ["a chain that only passes through the preview", [`${OTHER}/go`, `${PREVIEW}/go`, `${OTHER}/there`]],
    ])("ignores %s", async (_, urls) => {
      withSecret();
      const { context, start } = fakeContext();
      const leaked = recordLeaks(context, PREVIEW);

      start(chain(...urls));

      await expect(leaked()).resolves.toEqual([]);
    });

    it("stops counting redirects when the check starts", async () => {
      withSecret();
      const { context, start } = fakeContext();
      const leaked = recordLeaks(context, PREVIEW);

      const check = leaked();
      start(chain(`${PREVIEW}/go`, `${OTHER}/late`));

      await expect(check).resolves.toEqual([]);
    });
  });

  // No secret means no route, so a preview sending this run to Vercel's login
  // carries nothing, and calling that a leak would fail a harmless run.
  it("ignores a redirect off the preview when no secret is set", async () => {
    vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", "");
    const { context, start } = fakeContext();
    const leaked = recordLeaks(context, PREVIEW);

    start(chain(`${PREVIEW}/go`, `${OTHER}/login`));

    await expect(leaked()).resolves.toEqual([]);
  });

  it("rejects a second read", async () => {
    const { context } = fakeContext();
    const leaked = recordLeaks(context, PREVIEW);
    await leaked();

    await expect(leaked()).rejects.toThrow("This recording has ended");
  });
});

describe("recordSent", () => {
  // Answering from the old list would pass a test whose leak came after the
  // first check. Rejecting, not throwing, is what a caller's catch can handle.
  it("rejects a second read", async () => {
    const { context } = fakeContext();
    const sent = recordSent(context);
    await sent();

    const second = sent();

    await expect(second).rejects.toThrow("This recording has ended");
  });
});
