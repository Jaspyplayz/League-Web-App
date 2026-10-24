import { expect, test } from "@playwright/test";

// The bypass secret opens every preview of this site, so only the preview may
// receive it, never Data Dragon's images or Sentry's error reports (#156).
test("send the preview bypass secret only to the preview", async ({ page, baseURL }) => {
  test.skip(!process.env.VERCEL_AUTOMATION_BYPASS_SECRET, "No bypass secret to check.");
  const site = new URL(baseURL!).origin;
  const sent: Promise<{ origin: string; secret: boolean }>[] = [];
  // Headers a route adds show up only once the request has gone out, so read
  // them when it finishes, not when it starts.
  page.on("requestfinished", (request) => {
    const url = new URL(request.url());
    if (!url.protocol.startsWith("http")) return;
    sent.push(
      request
        .allHeaders()
        .then((headers) => ({ origin: url.origin, secret: "x-vercel-protection-bypass" in headers })),
    );
  });

  // The sample game shows champion and item images from Data Dragon.
  await page.goto("/");
  await page.getByRole("link", { name: "See a sample analysis" }).click();
  await expect(page.getByRole("region", { name: "Match summary" })).toContainText("Victory", {
    timeout: 30_000,
  });
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});

  const requests = await Promise.all(sent);
  const toSite = requests.filter((r) => r.origin === site);
  const elsewhere = requests.filter((r) => r.origin !== site);
  const leaked: Record<string, number> = {};
  for (const r of elsewhere) if (r.secret) leaked[r.origin] = (leaked[r.origin] ?? 0) + 1;

  expect(toSite.filter((r) => r.secret).length, "requests to the preview with the secret").toBeGreaterThan(0);
  expect(elsewhere.length, "requests to other sites").toBeGreaterThan(0);
  expect(leaked, "requests to other sites that got the secret").toEqual({});
});
