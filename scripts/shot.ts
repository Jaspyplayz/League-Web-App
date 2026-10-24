// `npm run shot`: screenshots of Turnpoint pages as a player sees them, for the
// evidence a PR needs (one per acceptance criterion, docs/workflow.md step 7).
// Agents use it through the verify skill (.claude/skills/verify/SKILL.md).
//
//   npm run shot -- /settings                       the local dev server
//   npm run shot -- --pr 155 / --light --phone      that PR's Vercel preview
//   npm run shot -- --check --pr 155                is that site worth driving?
//
// Screenshots go to the git-ignored .cache/verify/. A page that isn't the app
// working (Vercel's login, the expired Riot key notice, a 404, an error page)
// is not saved: the run prints what it saw and exits with an error.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { loadEnvConfig } from "@next/env";
import { chromium, devices, type BrowserContext, type Page } from "@playwright/test";
import { SAMPLE_MATCH_HREF } from "@/lib/sample-match";
import { THEME_KEY } from "@/lib/theme";
import { classify, type Outcome } from "./shot-outcome";

const USAGE = `Usage: npm run shot -- [--pr <number> | --base <url>] [--light] [--phone] [--tab <name>] <path>...
       npm run shot -- --check [--pr <number> | --base <url>]`;

const { values: options, positionals: paths } = parseArgs({
  allowPositionals: true,
  options: {
    pr: { type: "string" },
    base: { type: "string" },
    light: { type: "boolean", default: false },
    phone: { type: "boolean", default: false },
    tab: { type: "string" },
    out: { type: "string", default: ".cache/verify" },
    check: { type: "boolean", default: false },
  },
});

function run(command: string, args: string[]): string {
  return execFileSync(command, args, { encoding: "utf8" }).trim();
}

// A worktree has no .env.local of its own, so fall back to the main
// checkout's. Only the bypass secret is used, and it is never printed.
function loadEnv() {
  const here = process.cwd();
  const main = dirname(resolve(here, run("git", ["rev-parse", "--git-common-dir"])));
  loadEnvConfig(existsSync(join(here, ".env.local")) ? here : main);
}

// This project's previews, such as league-web-nc4mwtu4z-jaspy-s-team.vercel.app.
// Anyone can put a site on vercel.app, and the team name at the end is what
// keeps the bypass secret from going to someone else's.
const OUR_PREVIEWS = /^league-web-[a-z0-9-]+-jaspy-s-team\.vercel\.app$/;

// Vercel reports each commit's preview to GitHub as a deployment, which is
// also how the smoke test finds it (.github/workflows/smoke.yml). Only
// Vercel's own entries are trusted.
function previewUrl(pr: string): string {
  const sha = run("gh", ["pr", "view", pr, "--json", "headRefOid", "--jq", ".headRefOid"]);
  const statuses = run("gh", [
    "api",
    `repos/{owner}/{repo}/deployments?sha=${sha}&environment=Preview`,
    "--jq",
    '[.[] | select(.creator.login == "vercel[bot]")][0].statuses_url // empty',
  ]);
  const url =
    statuses &&
    run("gh", [
      "api",
      statuses,
      "--jq",
      '[.[] | select(.state == "success" and .creator.login == "vercel[bot]")][0].environment_url // empty',
    ]);
  if (!url) {
    throw new Error(`PR #${pr}'s latest commit has no finished Vercel preview yet. Wait for the Vercel check.`);
  }
  return url;
}

// The secret goes only to the site being driven. Playwright's
// extraHTTPHeaders would also send it with every image from Data Dragon and
// every report to Sentry (issue #156).
async function passPreviewLogin(context: BrowserContext, origin: string) {
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (!secret || !OUR_PREVIEWS.test(new URL(origin).hostname)) return;
  await context.route("**/*", async (route) => {
    const request = route.request();
    if (new URL(request.url()).origin !== origin) return route.continue();
    const headers = { ...(await request.allHeaders()), "x-vercel-protection-bypass": secret };
    return route.continue({ headers });
  });
}

type Visit = { page: Page; outcome: Outcome; reason: string; text: string };

async function visit(context: BrowserContext, origin: string, path: string): Promise<Visit> {
  const page = await context.newPage();
  let status: number | null = null;
  try {
    // A preview's first visit starts a cold server, like FIRST_LOAD in e2e/smoke.spec.ts.
    status = (await page.goto(new URL(path, origin).href, { timeout: 60_000 }))?.status() ?? null;
  } catch (error) {
    const reason = `couldn't load it: ${String(error).split("\n")[0]}`;
    return { page, outcome: "error", reason, text: "" };
  }
  // Pages stream in a section at a time. Analytics can keep the network busy,
  // so stop waiting after 15 seconds rather than never.
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  const text = await page.locator("body").innerText().catch(() => "");
  return { page, text, ...classify({ origin, url: page.url(), status, text }) };
}

function fileName(path: string): string {
  const parts = [decodeURIComponent(path).replace(/[^a-zA-Z0-9_]+/g, "-").replace(/^-|-$/g, "") || "home"];
  if (options.tab) parts.push(options.tab.toLowerCase().replace(/\s+/g, "-"));
  if (options.light) parts.push("light");
  if (options.phone) parts.push("phone");
  return `${parts.join("-")}.png`;
}

async function shoot(context: BrowserContext, origin: string, path: string): Promise<boolean> {
  const { page, outcome, reason, text } = await visit(context, origin, path);
  try {
    if (outcome !== "ok") {
      console.log(`FAILED ${path}: ${outcome}, ${reason}. Not saved.`);
      if (text) console.log(`  The page showed: ${text.slice(0, 300).replace(/\s+/g, " ")}`);
      return false;
    }
    if (options.tab) {
      const tab = page.getByRole("tab", { name: options.tab, exact: true });
      if (!(await tab.isVisible())) {
        console.log(`FAILED ${path}: no tab named "${options.tab}" on this page. Not saved.`);
        return false;
      }
      await tab.click();
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    }
    const file = resolve(options.out, fileName(path));
    mkdirSync(dirname(file), { recursive: true });
    await page.screenshot({ path: file, fullPage: true });
    console.log(`ok ${path}: saved ${file}`);
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
  const host = new URL(origin).hostname;
  if (OUR_PREVIEWS.test(host)) {
    const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET ? "set" : "not set";
    console.log(`bypass secret: ${secret}`);
  }
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
  if (!options.check && paths.length === 0) {
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
  const origin = new URL(
    options.pr ? previewUrl(options.pr) : (options.base ?? process.env.BASE_URL ?? "http://localhost:3000"),
  ).origin;

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext(devices[options.phone ? "Pixel 7" : "Desktop Chrome"]);
    if (options.light) await context.addInitScript((key) => localStorage.setItem(key, "light"), THEME_KEY);
    await passPreviewLogin(context, origin);

    let ok = true;
    if (options.check) ok = await check(context, origin);
    else for (const path of paths) ok = (await shoot(context, origin, path)) && ok;
    if (!ok) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
