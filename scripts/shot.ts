// `npm run shot`: screenshots of Turnpoint pages as a player sees them, for the
// evidence a PR needs (one per acceptance criterion, docs/workflow.md step 7).
// Agents use it through the verify skill (.claude/skills/verify/SKILL.md).
//
//   npm run shot -- /settings                       the local dev server
//   npm run shot -- --pr 155 / --light --phone      that PR's Vercel preview, 390px wide
//   npm run shot -- --check --pr 155                is that site worth driving?
//
// Screenshots go to the git-ignored .cache/verify/. A page that isn't the app
// working (Vercel's login, the expired Riot key notice, a 404, an error page)
// is not saved: the run prints what it saw and exits with an error. --expect
// saves one of those on purpose, for a PR that changes the 404 page.

import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { chromium, devices, type BrowserContext, type Page } from "@playwright/test";
import { SAMPLE_MATCH_HREF } from "@/lib/sample-match";
import { THEME_KEY } from "@/lib/theme";
import { passPreviewLogin } from "../e2e/preview-login";
import { loadEnv, previewUrl } from "./preview";
import { classify, OUTCOMES, type Outcome } from "./shot-outcome";

const USAGE = `Usage: npm run shot -- [--pr <number> | --base <url>] [--light] [--phone] [--tab <name>] [--expect <outcome>] <path>...
       npm run shot -- --check [--pr <number> | --base <url>]
Outcomes: ${OUTCOMES.join(", ")}`;

const { values: options, positionals: paths } = parseArgs({
  allowPositionals: true,
  options: {
    pr: { type: "string" },
    base: { type: "string" },
    light: { type: "boolean", default: false },
    phone: { type: "boolean", default: false },
    tab: { type: "string" },
    expect: { type: "string", default: "ok" },
    out: { type: "string", default: ".cache/verify" },
    check: { type: "boolean", default: false },
  },
});

// The design rules (.claude/rules/design.md) check every restyle at 390px
// wide, the width of most iPhones. Pixel 7 is 412px, so --phone keeps its
// touch, phone browser and pixel ratio and narrows the page to 390.
const pixel7 = devices["Pixel 7"];
const PHONE = { ...pixel7, viewport: { ...pixel7.viewport, width: 390 } };

type Look = { outcome: Outcome; reason: string; text: string };

// What the page shows right now.
async function look(page: Page, origin: string, status: number | null): Promise<Look> {
  // Pages stream in a section at a time. Analytics can keep the network busy,
  // so stop waiting after 15 seconds rather than never.
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  const text = await page.locator("body").innerText().catch(() => "");
  const noindex = (await page.locator('meta[name="robots"][content*="noindex"]').count()) > 0;
  // Next.js's route announcer is an alert too, empty after a full page load.
  const alerts = (await page.getByRole("alert").allInnerTexts()).map((alert) => alert.trim()).filter(Boolean);
  return { text, ...classify({ origin, url: page.url(), status, text, noindex, alerts }) };
}

type Visit = Look & { page: Page; status: number | null };

async function visit(context: BrowserContext, origin: string, path: string): Promise<Visit> {
  const page = await context.newPage();
  let status: number | null = null;
  try {
    // A preview's first visit starts a cold server, like FIRST_LOAD in e2e/smoke.spec.ts.
    status = (await page.goto(new URL(path, origin).href, { timeout: 60_000 }))?.status() ?? null;
  } catch (error) {
    const reason = `couldn't load it: ${String(error).split("\n")[0]}`;
    return { page, status, outcome: "error", reason, text: "" };
  }
  return { page, status, ...(await look(page, origin, status)) };
}

// Named after the site too, so a before on the live site and an after on the
// preview don't overwrite each other.
function fileName(site: string, path: string): string {
  const parts = [site, decodeURIComponent(path).replace(/[^a-zA-Z0-9_]+/g, "-").replace(/^-|-$/g, "") || "home"];
  if (options.tab) parts.push(options.tab.toLowerCase().replace(/\s+/g, "-"));
  if (options.light) parts.push("light");
  if (options.phone) parts.push("phone");
  return `${parts.join("-")}.png`;
}

async function shoot(context: BrowserContext, origin: string, site: string, path: string): Promise<boolean> {
  const { page, status, ...loaded } = await visit(context, origin, path);
  try {
    let seen: Look = loaded;
    if (options.tab && seen.outcome === "ok") {
      const tab = page.getByRole("tab", { name: options.tab, exact: true });
      if (!(await tab.isVisible())) {
        console.log(`FAILED ${path}: no tab named "${options.tab}" on this page. Not saved.`);
        return false;
      }
      await tab.click();
      // A click before the page is ready does nothing, and the new panel was
      // hidden when the page was first read, so it is checked again.
      const opened = await tab
        .and(page.locator('[aria-selected="true"]'))
        .waitFor({ timeout: 10_000 })
        .then(() => true, () => false);
      if (!opened) {
        console.log(`FAILED ${path}: the "${options.tab}" tab didn't open. Not saved.`);
        return false;
      }
      seen = await look(page, origin, status);
    }
    if (seen.outcome !== options.expect) {
      console.log(`FAILED ${path}: ${seen.outcome}, ${seen.reason}. Not saved.`);
      if (seen.text) console.log(`  The page showed: ${seen.text.slice(0, 300).replace(/\s+/g, " ")}`);
      return false;
    }
    const file = resolve(options.out, fileName(site, path));
    mkdirSync(dirname(file), { recursive: true });
    await page.screenshot({ path: file, fullPage: true });
    console.log(`${seen.outcome} ${path}: saved ${file}`);
    return true;
  } finally {
    await page.close();
  }
}

// One look before driving: is the site up, can it read the database, and is
// the Riot key working? The sample game needs no Riot call (src/lib/sample-match.ts),
// so it still works when the development key has expired.
async function check(context: BrowserContext, origin: string): Promise<boolean> {
  console.log(`site: ${origin}`);
  if (options.pr) {
    const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET ? "set" : "not set";
    console.log(`bypass secret: ${secret}`);
  }
  const host = new URL(origin).hostname;
  if ((host === "localhost" || host === "127.0.0.1") && !existsSync(".env.local")) {
    console.log(
      "note: this folder has no .env.local. A dev server started here has no database or Riot key, so pages with game data show the Riot key notice. Use --pr <number> to check the preview instead.",
    );
  }
  const pages = [
    { label: "home page", path: "/", required: true },
    { label: "sample game (database)", path: SAMPLE_MATCH_HREF, required: true },
    { label: "player page (Riot key)", path: "/player/kr/Hide%20on%20bush-KR1", required: false },
  ];
  let ok = true;
  for (const { label, path, required } of pages) {
    const { page, outcome, reason } = await visit(context, origin, path);
    await page.close();
    console.log(`${label}: ${outcome} (${reason})`);
    if (outcome !== "ok" && required) ok = false;
  }
  return ok;
}

async function main() {
  if ((!options.check && paths.length === 0) || !OUTCOMES.includes(options.expect as Outcome)) {
    console.log(USAGE);
    process.exitCode = 1;
    return;
  }
  // Git Bash turns an argument like /settings into C:/Program Files/Git/settings
  // before this script sees it.
  const rewritten = paths.find((path) => /^[A-Za-z]:[\\/]/.test(path));
  if (rewritten) {
    console.log(
      `"${rewritten}" looks like Git Bash rewrote a /path. Run it as MSYS_NO_PATHCONV=1 npm run shot -- ..., or leave off the leading slash.`,
    );
    process.exitCode = 1;
    return;
  }
  loadEnv();
  const preview = options.pr ? new URL(previewUrl(options.pr)).origin : undefined;
  const origin = preview ?? new URL(options.base ?? process.env.BASE_URL ?? "http://localhost:3000").origin;
  const site = options.pr ? `pr${options.pr}` : new URL(origin).hostname.split(".")[0];

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext(options.phone ? PHONE : devices["Desktop Chrome"]);
    if (options.light) await context.addInitScript((key) => localStorage.setItem(key, "light"), THEME_KEY);
    if (preview) await passPreviewLogin(context, preview);

    let ok = true;
    if (options.check) ok = await check(context, origin);
    else for (const path of paths) ok = (await shoot(context, origin, site, path)) && ok;
    if (!ok) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
