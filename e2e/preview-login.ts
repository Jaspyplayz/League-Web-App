import type { BrowserContext, Request } from "@playwright/test";

// Vercel's preview protection lets a request through when it carries the
// "Protection Bypass for Automation" secret. That secret opens every preview,
// so it goes only to the preview's own origin. Playwright's extraHTTPHeaders
// would also send it with every image from Data Dragon and every report to
// Sentry (#156). A redirect from the preview to another site still carries it,
// and e2e/fixtures.ts fails the test if that redirect starts before the check
// (docs/adr/0006-bypass-secret-only-to-preview.md says what it can't catch).
export async function passPreviewLogin(context: BrowserContext, origin: string) {
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (!secret) return;
  await context.route("**/*", async (route) => {
    const request = route.request();
    if (new URL(request.url()).origin !== origin) return route.continue();
    const headers = { ...(await request.allHeaders()), "x-vercel-protection-bypass": secret };
    return route.continue({ headers });
  });
}

type Sent = { origin: string; secret: boolean };

// Headers a route adds show up only once the request has gone out, so read
// them when it finishes, not when it starts.
//
// The function this returns ends the recording, so it can be called only once.
// A request that finishes later isn't in the list, and neither is one that
// fails. A later one can't be read safely: the browser may be closing by then,
// so the read would reject with nothing waiting for it, and Playwright fails the
// running test for any unhandled rejection (JAS-141). A second call fails instead
// of answering from the old list, which could hide a leak that came after the
// first.
export function recordSent(context: BrowserContext): () => Promise<Sent[]> {
  const sent: Promise<Sent>[] = [];
  let ended = false;
  const onFinished = (request: Request) => {
    const url = new URL(request.url());
    if (!url.protocol.startsWith("http")) return;
    sent.push(
      request
        .allHeaders()
        .then((headers) => ({ origin: url.origin, secret: "x-vercel-protection-bypass" in headers })),
    );
  };
  context.on("requestfinished", onFinished);
  return async () => {
    if (ended) throw new Error("This recording has ended. Start a new one to check later requests.");
    ended = true;
    context.off("requestfinished", onFinished);
    return Promise.all(sent);
  };
}

function firstHop(request: Request): Request {
  const from = request.redirectedFrom();
  return from ? firstHop(from) : request;
}

// This lists the sites other than `origin` that got the secret, in two ways.
//
// Reading each finished request's headers catches a secret sent anywhere, such
// as by a config that adds it to every request, but not on a request still
// running at the check or one that failed.
//
// A redirect has neither gap. A route runs only on a chain's first request, and
// Playwright adds its headers to every later hop, so with a secret set, a hop
// off `origin` in a chain that started there carries it (JAS-142). The hop's
// `request` event says so as it starts, without asking the browser, so a hop that
// later fails or never answers still counts, and nothing can reject as the
// browser closes.
export function recordLeaks(context: BrowserContext, origin: string): () => Promise<string[]> {
  const sent = recordSent(context);
  const redirectedTo = new Set<string>();
  const onRequest = (request: Request) => {
    const site = new URL(request.url()).origin;
    if (site !== origin && new URL(firstHop(request).url()).origin === origin) redirectedTo.add(site);
  };
  // With no secret there's no route, so a redirect off the site carries nothing,
  // such as a preview sending a run with no secret to Vercel's login.
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) context.on("request", onRequest);
  return async () => {
    context.off("request", onRequest);
    const gotHeader = (await sent()).filter((r) => r.secret && r.origin !== origin).map((r) => r.origin);
    return [...new Set([...gotHeader, ...redirectedTo])];
  };
}
