// Start a Turnpoint dev server for verification, owned by this run.
//   npx tsx .claude/skills/verify-turnpoint/scripts/launch.ts [port]   (default 3100, never 3000)
// Ready = the log says "Ready in" AND the home page renders "Find the minute"
// (the first request compiles it). Works on Windows, Linux and macOS.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { INSTANCE_DIR, isOurs, nextBin, portAnswers, readInstance, serverArgs, sleep, STATE_FILE, type Instance } from "./instance";

const port = Number(process.argv[2] ?? process.env.PORT ?? 3100);
const root = process.cwd();
const base = `http://127.0.0.1:${port}`;
const log = join(INSTANCE_DIR, `dev-${port}.log`);

const tail = () => readFileSync(log, "utf8").split("\n").slice(-40).join("\n");

async function homeRenders(): Promise<boolean> {
  try {
    const res = await fetch(`${base}/`, { signal: AbortSignal.timeout(60_000) });
    return res.ok && (await res.text()).includes("Find the minute");
  } catch {
    return false;
  }
}

async function launch(): Promise<number> {
  if (port === 3000) return refuse("refusing port 3000: it may be Jasper's own server");
  const earlier = readInstance();
  if (earlier && isOurs(earlier)) {
    return refuse(`an instance from an earlier run is still up (pid ${earlier.pid}, ${earlier.base}). Run cleanup.ts first, or drive it after doctor.ts.`);
  }
  if (await portAnswers(port)) return refuse(`port ${port} is already taken by someone else; pick another: launch.ts 3101`);
  const next = nextBin(root);
  if (!existsSync(next)) return refuse("node_modules/next is missing: run npm ci first");
  if (!existsSync(join(root, ".env.local"))) {
    console.log("note: no .env.local, so no RIOT_API_KEY, DATABASE_URL or Supabase. Only journeys that need 'nothing' can pass here; drive the live site or a preview for the rest.");
  }

  mkdirSync(INSTANCE_DIR, { recursive: true });
  const out = openSync(log, "w");
  // detached gives the server its own process group on Linux and macOS, so
  // cleanup.ts stops it and its children and nothing else. On Windows,
  // cleanup.ts stops its process tree.
  const server = spawn(process.execPath, [next, ...serverArgs(port)], {
    cwd: root,
    detached: true,
    stdio: ["ignore", out, out],
    windowsHide: true,
  });
  let exited = false;
  server.once("exit", () => (exited = true));
  server.unref();
  const instance: Instance = { pid: server.pid!, port, base, log, root };
  writeFileSync(STATE_FILE, JSON.stringify(instance) + "\n");

  for (let second = 0; second < 120; second++) {
    if (exited) {
      console.log(`dev server exited. Log:\n${tail()}`);
      rmSync(STATE_FILE, { force: true });
      return 1;
    }
    if (readFileSync(log, "utf8").includes("Ready in") && (await homeRenders())) {
      console.log(`ready: ${base} (pid ${instance.pid}, log ${log})`);
      return 0;
    }
    await sleep(1_000);
  }
  console.log(`not ready after 120s. Log:\n${tail()}`);
  return 1;
}

function refuse(why: string): number {
  console.log(why);
  return 1;
}

launch().then((code) => process.exit(code));
