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
