// Shared harness for verify-turnpoint and verify-turnpoint-ux.
// Drives Turnpoint in headless Chromium (Playwright) and writes evidence to
// .cache/verify-turnpoint/<run id>/<journey>/ (git-ignored, never removed by cleanup.ts).
//
// Not a test runner: each journey is a list of user steps. Every step saves a
// screenshot, an ARIA snapshot of <main>, the URL, and a line in steps.jsonl.
// The first failing expectation stops the journey and is recorded as the result.

import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { chromium, devices, expect, type Browser, type Page } from "@playwright/test";
import { passPreviewLogin, recordLeaks } from "../../../../e2e/preview-login";
import { loadEnv } from "../../../../scripts/preview";
import { isOurs } from "./instance";
import { pickTarget } from "./target";

export const LIVE = "https://league-web-app.vercel.app";
export const SAMPLE_MATCH_PATH = "/player/kr/Hide%20on%20bush-KR1/match/KR_8416261221";
export const TEST_PLAYER = { riotId: "Hide on bush#KR1", region: "kr", path: "/player/kr/Hide%20on%20bush-KR1" };
// The same strings scripts/shot-outcome.ts classifies on.
export const RIOT_KEY_NOTICE = "The site's Riot API key isn't working";
export const ERROR_TEXTS = ["Something went wrong", "Application error: a client-side exception"];

export type Needs = "nothing" | "database" | "riot" | "supabase";

export type Ctx = {
  page: Page;
  base: string;
  /** Record one user step: run `act`, then save screenshot + ARIA + URL. */
  step: (name: string, act: () => Promise<void>) => Promise<void>;
  note: (key: string, value: unknown) => void;
};

export type Journey = {
  name: string;
  feature: string; // the features/*.md file this journey proves
  needs: Needs[];
  phone?: boolean;
  run: (ctx: Ctx) => Promise<void>;
};

function sh(cmd: string, args: string[]): string {
  try {
    return execFileSync(cmd, args, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

export function evidenceRoot(): string {
  return resolve(process.cwd(), ".cache/verify-turnpoint");
}

async function newPage(
  browser: Browser,
  base: string,
  phone: boolean,
  preview: string | undefined,
): Promise<{ page: Page; leaked: () => Promise<string[]> }> {
  const context = await browser.newContext({
    ...devices[phone ? "Pixel 7" : "Desktop Chrome"],
    baseURL: base,
    // Same reduced-motion setting for every run so smooth scrolls finish before a screenshot.
    reducedMotion: "reduce",
  });
  if (!preview) return { page: await context.newPage(), leaked: async () => [] };
  await passPreviewLogin(context, preview);
  return { page: await context.newPage(), leaked: recordLeaks(context, preview) };
}

/** Fail fast with the page's own words when it is not the app working. */
export async function assertAppPage(page: Page) {
  const text = await page.locator("body").innerText().catch(() => "");
  if (text.includes(RIOT_KEY_NOTICE)) throw new Error(`riot-key: the page shows "${RIOT_KEY_NOTICE}"`);
  const err = ERROR_TEXTS.find((t) => text.includes(t));
  if (err) throw new Error(`error page: "${err}"`);
  if (new URL(page.url()).hostname.endsWith("vercel.com")) throw new Error("vercel-login: redirected to Vercel's login");
}

export async function main(journeys: Journey[], usage: string) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      base: { type: "string" },
      pr: { type: "string" },
      run: { type: "string" },
      list: { type: "boolean", default: false },
    },
  });
  if (values.list || positionals.length === 0) {
    console.log(usage);
    for (const j of journeys) console.log(`  ${j.name.padEnd(22)} needs: ${j.needs.join(", ").padEnd(18)} features/${j.feature}`);
    process.exitCode = values.list ? 0 : 1;
    return;
  }
  const names = positionals[0] === "all" ? journeys.map((j) => j.name) : positionals;
  const unknown = names.filter((n) => !journeys.some((j) => j.name === n));
  if (unknown.length) {
    console.log(`Unknown journey: ${unknown.join(", ")}. Run with --list.`);
    process.exitCode = 1;
    return;
  }
  const target = pickTarget(values);
  if ("error" in target) {
    console.log(target.error);
    process.exitCode = 1;
    return;
  }
  if (target.instance && !isOurs(target.instance)) {
    console.log(`The server in the state file (${target.base}) is no longer the one launch.ts started. Run cleanup.ts, then launch.ts.`);
    process.exitCode = 1;
    return;
  }
  const { base, preview } = target;
  if (preview) loadEnv();
  const runId = values.run ?? process.env.RUN_ID ?? new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = join(evidenceRoot(), runId);
  mkdirSync(runDir, { recursive: true });
  const meta = {
    runId,
    base,
    commit: sh("git", ["rev-parse", "--short", "HEAD"]),
    dirty: sh("git", ["status", "--porcelain", "--", "src"]) !== "",
    startedAt: new Date().toISOString(),
  };
  writeFileSync(join(runDir, "run.json"), JSON.stringify(meta, null, 2));

  const browser = await chromium.launch();
  let failed = 0;
  try {
    for (const name of names) {
      const journey = journeys.find((j) => j.name === name)!;
      const dir = join(runDir, name);
      mkdirSync(dir, { recursive: true });
      const log = join(dir, "steps.jsonl");
      const { page, leaked } = await newPage(browser, base, journey.phone ?? false, preview);
      const consoleErrors: string[] = [];
      page.on("pageerror", (e) => consoleErrors.push(String(e).slice(0, 300)));
      const notes: Record<string, unknown> = {};
      let n = 0;
      const ctx: Ctx = {
        page,
        base,
        note: (k, v) => {
          notes[k] = v;
        },
        step: async (stepName, act) => {
          n += 1;
          const id = `${String(n).padStart(2, "0")}-${stepName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
          const started = Date.now();
          let error: string | undefined;
          try {
            await act();
          } catch (e) {
            error = String(e instanceof Error ? e.message : e).split("\n").slice(0, 6).join(" | ");
          }
          await page.screenshot({ path: join(dir, `${id}.png`), fullPage: false }).catch(() => {});
          const aria = await page.locator("main").first().ariaSnapshot({ timeout: 5_000 }).catch(() => "(no <main>)");
          writeFileSync(join(dir, `${id}.aria.yml`), aria);
          appendFileSync(log, JSON.stringify({ step: id, url: page.url(), ms: Date.now() - started, ok: !error, error }) + "\n");
          console.log(`  ${error ? "FAIL" : "ok  "} ${id}${error ? `: ${error}` : ""}`);
          if (error) throw new Error(`${id}: ${error}`);
        },
      };
      console.log(`${name} (${base})`);
      let result: { ok: boolean; error?: string };
      try {
        await journey.run(ctx);
        result = { ok: true };
      } catch (e) {
        result = { ok: false, error: String(e instanceof Error ? e.message : e) };
      }
      const leaks = await leaked();
      if (leaks.length) result = { ok: false, error: `the bypass secret went to other sites: ${leaks.join(", ")}` };
      if (!result.ok) failed += 1;
      writeFileSync(
        join(dir, "result.json"),
        JSON.stringify({ journey: name, feature: journey.feature, base, ...result, notes, pageErrors: consoleErrors }, null, 2),
      );
      console.log(`${result.ok ? "PASS" : "FAIL"} ${name} -> ${dir}`);
      await page.context().close();
    }
  } finally {
    await browser.close();
  }
  console.log(`evidence: ${runDir}`);
  process.exitCode = failed ? 1 : 0;
}

export { expect };
