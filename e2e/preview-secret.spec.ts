import http from "node:http";
import type { AddressInfo } from "node:net";
import type { Browser } from "@playwright/test";
import { expect, test } from "./fixtures";
import { passPreviewLogin, recordLeaks, recordSent } from "./preview-login";

// The fixture fails any test whose requests took the secret to another site.
// This test checks that check has something to catch: the preview got the
// secret, and the page also loaded from other sites.
test("send the preview bypass secret only to the preview", async ({ page, baseURL }) => {
  test.skip(!process.env.VERCEL_AUTOMATION_BYPASS_SECRET, "No bypass secret to check.");
  const site = new URL(baseURL!).origin;
  const sent = recordSent(page.context());

  await page.goto("/");
  await page.getByRole("link", { name: "Open this game", exact: true }).click();
  await expect(page.getByRole("region", { name: "Match summary" })).toContainText("Victory", {
    timeout: 30_000,
  });
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});

  const requests = await sent();
  expect(requests.filter((r) => r.origin === site && r.secret).length, "requests to the preview with the secret").toBeGreaterThan(0);
  expect(requests.filter((r) => r.origin !== site).length, "requests to other sites").toBeGreaterThan(0);
});

// The check rests on how Playwright and Chrome behave, which made-up requests
// can't show, so these use a real browser. Two local servers stand in for the
// preview and another site, with a made-up secret, so they need no preview and
// the real secret goes nowhere. 127.0.0.1 and localhost count as different sites.
test.describe("the check on redirects", () => {
  const SECRET = "VERCEL_AUTOMATION_BYPASS_SECRET";
  const realSecret = process.env[SECRET];
  const heard: { url: string; secret: boolean }[] = [];
  const servers: http.Server[] = [];
  let preview = "";
  let other = "";

  async function startSite(host: string) {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url!, "http://local");
      if (url.pathname === "/favicon.ico") return void res.writeHead(404).end();
      heard.push({ url: `http://${host}:${(server.address() as AddressInfo).port}${req.url}`, secret: "x-vercel-protection-bypass" in req.headers });
      if (url.pathname === "/go") return void res.writeHead(302, { location: url.searchParams.get("to")!, "access-control-allow-origin": "*" }).end();
      if (url.pathname === "/hang") return;
      if (url.pathname === "/script") {
        const script = `fetch(${JSON.stringify(url.searchParams.get("to"))}, { keepalive: ${url.searchParams.get("keepalive")} }).catch(() => {})`;
        return void res.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html><title>script</title><script>${script}</script>`);
      }
      if (url.pathname === "/die") return void req.socket.destroy();
      if (url.pathname === "/page") return void res.writeHead(200, { "content-type": "text/html" }).end("<!doctype html><title>page</title>");
      // Plain text, since Chrome fails a no-cors fetch that gets HTML.
      res.writeHead(200, { "content-type": "text/plain", "access-control-allow-origin": "*" }).end("ok");
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, host, resolve));
    return `http://${host}:${(server.address() as AddressInfo).port}`;
  }

  test.beforeAll(async () => {
    preview = await startSite("127.0.0.1");
    other = await startSite("localhost");
  });

  test.afterAll(async () => {
    for (const server of servers) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test.beforeEach(() => {
    process.env[SECRET] = "made-up-for-this-test";
  });

  test.afterEach(() => {
    if (realSecret === undefined) delete process.env[SECRET];
    else process.env[SECRET] = realSecret;
  });

  const via = (site: string, to: string) => `${site}/go?to=${encodeURIComponent(to)}`;

  type Case = {
    url: () => string;
    lastHop: string;
    init?: RequestInit;
    newTab?: boolean;
    addToEveryRequest?: boolean;
    noChromeWatch?: boolean;
  };

  const cases: (Case & { name: string; carries: boolean })[] = [
    { name: "catches a redirect whose last hop fails", url: () => via(preview, `${other}/die`), lastHop: "/die", carries: true },
    { name: "catches a redirect still running at the check", url: () => via(preview, `${other}/hang`), lastHop: "/hang", carries: true },
    { name: "catches a redirect that answers", url: () => via(preview, `${other}/ok`), lastHop: "/ok", carries: true },
    { name: "catches a keepalive fetch's redirect", url: () => via(preview, `${other}/ok`), lastHop: "/ok", init: { keepalive: true }, carries: true },
    { name: "catches a keepalive fetch from a new tab's first script", url: () => via(preview, `${other}/ok`), lastHop: "/ok", init: { keepalive: true }, newTab: true, carries: true },
    // Chrome's reports cover what the event reports on a page, so this turns them
    // off to test the event by itself. /hang keeps the finished-request read out too.
    // The event goes missing about 1 run in 200 for an unknown reason, which fails
    // this test alone, so CI's retry shows it as flaky (decision record 0006).
    { name: "catches a redirect with only Playwright's request event", url: () => via(preview, `${other}/hang`), lastHop: "/hang", noChromeWatch: true, carries: true },
    { name: "catches a secret a config adds to every request", url: () => `${other}/ok`, lastHop: "/ok", init: { mode: "no-cors" }, addToEveryRequest: true, carries: true },
    { name: "passes a request to another site", url: () => `${other}/ok`, lastHop: "/ok", init: { mode: "no-cors" }, carries: false },
    { name: "passes a chain that only passes through the preview", url: () => via(other, via(preview, `${other}/ok`)), lastHop: "/ok", init: { mode: "no-cors" }, carries: false },
  ];

  async function runCheck(browser: Browser, { url, lastHop, init = {}, newTab, addToEveryRequest, noChromeWatch }: Case) {
    heard.length = 0;
    // How the first leak happened: playwright.config.ts set this for every request.
    const extraHTTPHeaders = addToEveryRequest ? { "x-vercel-protection-bypass": "made-up-for-this-test" } : undefined;
    const context = await browser.newContext({ baseURL: preview, extraHTTPHeaders });
    await passPreviewLogin(context, preview);
    if (noChromeWatch) context.newCDPSession = () => Promise.reject(new Error("Chrome's reports are off for this test"));
    const leaked = recordLeaks(context, preview);
    const page = await context.newPage();
    await page.goto("/page");
    const address = url();
    if (newTab) await page.evaluate((u) => void window.open(u), `${preview}/script?keepalive=${init.keepalive ?? false}&to=${encodeURIComponent(address)}`);
    else await page.evaluate(([u, i]) => void fetch(u as string, i as RequestInit).catch(() => {}), [address, init]);
    await expect.poll(() => heard.some((h) => h.url === `${other}${lastHop}`)).toBe(true);
    // A failing hop, or a new tab's keepalive, is reported after the server hears it.
    await page.waitForTimeout(500);
    const answer = await leaked();
    const secretAtOther = heard.filter((h) => h.url.startsWith(other)).some((h) => h.secret);
    await context.close();
    return { answer, secretAtOther };
  }

  for (const { name, carries, ...input } of cases) {
    test(name, async ({ browser }) => {
      const { answer, secretAtOther } = await runCheck(browser, input);
      expect(secretAtOther, "the other site's server got the secret").toBe(carries);
      expect(answer).toEqual(carries ? [other] : []);
    });
  }

  test("passes a redirect when no secret is set", async ({ browser }) => {
    delete process.env[SECRET];
    const { answer, secretAtOther } = await runCheck(browser, { url: () => via(preview, `${other}/ok`), lastHop: "/ok" });
    expect(secretAtOther, "the other site's server got the secret").toBe(false);
    expect(answer).toEqual([]);
  });
});
