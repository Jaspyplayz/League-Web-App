// Read-only: is this Turnpoint instance worth driving, and which journeys can pass on it?
//   npx tsx .claude/skills/verify-turnpoint/scripts/doctor.ts [--base <url>]
// Exit 0 = the home page is the app. Each capability line says which `needs:` it unlocks.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { parseArgs } from "node:util";
import { chromium } from "@playwright/test";
import { passPreviewLogin } from "../../../../e2e/preview-login";
import { isAlive, readInstance } from "./instance";
import { defaultBase, ERROR_TEXTS, LIVE, RIOT_KEY_NOTICE, SAMPLE_MATCH_PATH, TEST_PLAYER } from "./runner";

const { values } = parseArgs({ options: { base: { type: "string" } } });
const base = (values.base ?? process.env.BASE_URL ?? defaultBase())?.replace(/\/$/, "");

function sh(cmd: string, args: string[]): string {
  try {
    return execFileSync(cmd, args, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

async function run() {
  if (!base) {
    console.log("target: none. Run launch.ts, or pass --base https://league-web-app.vercel.app");
    return 1;
  }
  console.log(`target: ${base}`);
  console.log(`checkout: ${sh("git", ["rev-parse", "--short", "HEAD"])} on ${sh("git", ["branch", "--show-current"])}`);
  const local = /^http:\/\/(127\.0\.0\.1|localhost)/.test(base);
  if (local) {
    const instance = readInstance();
    if (!instance) {
      console.log("instance: NOT OURS. No state file; launch.ts didn't start this server. Don't drive it.");
      return 1;
    }
    if (instance.base !== base) {
      console.log(`instance: NOT OURS. Our instance is ${instance.base}.`);
      return 1;
    }
    // next dev exits when its port is taken, so while our server's process is
    // alive, the port is ours.
    const alive = isAlive(instance.pid);
    console.log(`instance: pid ${instance.pid} ${alive ? "alive, so the port is ours" : "DEAD"}, port ${instance.port}`);
    console.log(`env: .env.local ${existsSync(".env.local") ? "present" : "absent (no Riot key, database or Supabase)"}`);
    if (!alive) return 1;
  } else if (base === LIVE) {
    console.log("instance: live site (what main shows now). Read-only journeys only; each profile load spends Riot requests.");
  } else {
    console.log(`instance: preview. bypass secret ${process.env.VERCEL_AUTOMATION_BYPASS_SECRET ? "set" : "NOT set (expect vercel-login)"}`);
  }

  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL: base });
  const origin = new URL(base).origin;
  if (origin.endsWith(".vercel.app") && origin !== LIVE) await passPreviewLogin(context, origin);
  const page = await context.newPage();
  const probe = async (path: string, want: string) => {
    try {
      const res = await page.goto(path, { timeout: 60_000 });
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
      const text = await page.locator("body").innerText();
      if (new URL(page.url()).hostname.endsWith("vercel.com")) return "vercel-login";
      if (text.includes(RIOT_KEY_NOTICE)) return "riot-key";
      const err = ERROR_TEXTS.find((t) => text.includes(t));
      if (err) return `error (${err})`;
      // innerText follows CSS text-transform (headings are uppercase), so compare case-insensitively.
      if (!text.toLowerCase().includes(want.toLowerCase())) return `missing "${want}" (status ${res?.status()})`;
      return "ok";
    } catch (e) {
      return `unreachable (${String(e).split("\n")[0]})`;
    }
  };
  const home = await probe("/", "Find the minute");
  const db = await probe(SAMPLE_MATCH_PATH, "60-second review");
  const riot = await probe(TEST_PLAYER.path, "Recent matches");
  let supa = await probe(`${TEST_PLAYER.path}/ask`, "to ask questions");
  if (supa !== "ok" && riot === "ok") supa = `${supa}; Ask is off here (needs ANTHROPIC_API_KEY + Supabase + DATABASE_URL)`;
  await browser.close();
  console.log(`home page            [needs: nothing]  ${home}`);
  console.log(`sample game          [needs: database] ${db}`);
  console.log(`player profile       [needs: riot]     ${riot}`);
  console.log(`signed-out Ask       [needs: supabase] ${supa}`);
  return home === "ok" ? 0 : 1;
}

run().then((code) => (process.exitCode = code));
