import { expect, test as base, type BrowserContext } from "@playwright/test";
import { passPreviewLogin } from "./preview-login";

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

export const test = base.extend({
  // Named provide, not Playwright's usual use, which the React hooks lint rule
  // mistakes for a hook.
  context: async ({ context, baseURL }, provide) => {
    const preview = new URL(baseURL!).origin;
    await passPreviewLogin(context, preview);
    const sent = recordSent(context);
    await provide(context);
    // Playwright also adds a route's headers to the redirects a request
    // follows, so a redirect to another site would carry the secret there.
    const leaked = (await sent()).filter((r) => r.secret && r.origin !== preview).map((r) => r.origin);
    expect([...new Set(leaked)], "other sites that got the bypass secret").toEqual([]);
  },
});

export { expect };
