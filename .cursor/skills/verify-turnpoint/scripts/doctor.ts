// Read-only: is this Turnpoint instance worth driving, and which journeys can pass on it?
//   npx tsx .cursor/skills/verify-turnpoint/scripts/doctor.ts [--base <url>]
// Exit 0 = the home page is the app. Each capability line says which `needs:` it unlocks.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { chromium } from "@playwright/test";
import { passPreviewLogin } from "../../../../e2e/preview-login";
import { defaultBase, ERROR_TEXTS, LIVE, RIOT_KEY_NOTICE, SAMPLE_MATCH_PATH, STATE_FILE, TEST_PLAYER } from "./runner";

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
    console.log("target: none. Run launch.sh, or pass --base https://league-web-app.vercel.app");
    return 1;
  }
  console.log(`target: ${base}`);
  console.log(`checkout: ${sh("git", ["rev-parse", "--short", "HEAD"])} on ${sh("git", ["branch", "--show-current"])}`);
  const local = /^http:\/\/(127\.0\.0\.1|localhost)/.test(base);
  if (local) {
    if (!existsSync(STATE_FILE)) {
      console.log("instance: NOT OURS. No state file; launch.sh didn't start this server. Don't drive it.");
      return 1;
    }
    const st = JSON.parse(readFileSync(STATE_FILE, "utf8"));
    if (st.base !== base) {
      console.log(`instance: NOT OURS. Our instance is ${st.base}.`);
      return 1;
    }
    const alive = sh("ps", ["-o", "pid=", "-g", String(st.pgid)]) !== "";
    const listener = sh("ss", ["-ltnpH", `sport = :${st.port}`]);
    const pids = sh("ps", ["-o", "pid=", "-g", String(st.pgid)]).split(/\s+/).filter(Boolean);
    const owned = pids.some((p) => listener.includes(`pid=${p},`));
    console.log(`instance: pid ${st.pid} ${alive ? "alive" : "DEAD"}, port ${st.port} ${owned ? "owned by our process group" : "NOT owned by us"}`);
    console.log(`env: .env.local ${existsSync(".env.local") ? "present" : "absent (no Riot key, database or Supabase)"}`);
    if (!alive || !owned) return 1;
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
