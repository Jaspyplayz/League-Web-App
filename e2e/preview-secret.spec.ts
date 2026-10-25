import { expect, recordSent, test } from "./fixtures";

// The fixture fails any test whose requests took the secret to another site.
// This test checks that check has something to catch: the preview got the
// secret, and the page also loaded from other sites.
test("send the preview bypass secret only to the preview", async ({ page, baseURL }) => {
  test.skip(!process.env.VERCEL_AUTOMATION_BYPASS_SECRET, "No bypass secret to check.");
  const site = new URL(baseURL!).origin;
  const sent = recordSent(page.context());

  await page.goto("/");
  await page.getByRole("link", { name: "See a sample analysis" }).click();
  await expect(page.getByRole("region", { name: "Match summary" })).toContainText("Victory", {
    timeout: 30_000,
  });
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});

  const requests = await sent();
  expect(requests.filter((r) => r.origin === site && r.secret).length, "requests to the preview with the secret").toBeGreaterThan(0);
  expect(requests.filter((r) => r.origin !== site).length, "requests to other sites").toBeGreaterThan(0);
});
