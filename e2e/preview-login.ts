import type { BrowserContext } from "@playwright/test";

// Vercel's preview protection lets a request through when it carries the
// "Protection Bypass for Automation" secret. That secret opens every preview,
// so it goes only to the preview's own origin. Playwright's extraHTTPHeaders
// would also send it with every image from Data Dragon and every report to
// Sentry (#156). A redirect from the preview to another site still carries it,
// and e2e/fixtures.ts fails the test when that happens.
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
export function recordSent(context: BrowserContext): () => Promise<Sent[]> {
  const sent: Promise<Sent>[] = [];
  context.on("requestfinished", (request) => {
    const url = new URL(request.url());
    if (!url.protocol.startsWith("http")) return;
    sent.push(
      request
        .allHeaders()
        .then((headers) => ({ origin: url.origin, secret: "x-vercel-protection-bypass" in headers })),
    );
  });
  return () => Promise.all(sent);
}

// Playwright also adds a route's headers to the redirects a request follows,
// so a redirect to another site would carry the secret there. This lists the
// sites other than `origin` that got it.
export function recordLeaks(context: BrowserContext, origin: string): () => Promise<string[]> {
  const sent = recordSent(context);
  return async () => [...new Set((await sent()).filter((r) => r.secret && r.origin !== origin).map((r) => r.origin))];
}
