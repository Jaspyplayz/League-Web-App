import { EventEmitter } from "node:events";
import type { BrowserContext, Request } from "@playwright/test";
import { describe, expect, it, vi } from "vitest";
import { recordLeaks } from "../e2e/preview-login";

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
  };
}

function fakeRequest(url: string, allHeaders: () => Promise<Record<string, string>>) {
  return { url: () => url, allHeaders: vi.fn(allHeaders) } as unknown as Request;
}

const sentWith = (headers: Record<string, string>) => () => Promise.resolve(headers);
const closedBrowser = () => Promise.reject(new Error(CLOSED));

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
    await leaked();

    const late = fakeRequest(`${OTHER}/image.png`, closedBrowser);
    finish(late);

    expect(late.allHeaders).not.toHaveBeenCalled();
  });
});
