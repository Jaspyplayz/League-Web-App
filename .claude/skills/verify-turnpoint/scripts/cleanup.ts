// Stop only the dev server launch.ts started, from the state file. Never stops
// a process by name. Keeps .cache/verify-turnpoint/ (the evidence).
//   npx tsx .claude/skills/verify-turnpoint/scripts/cleanup.ts

import { execFileSync } from "node:child_process";
import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { INSTANCE_DIR, isAlive, isOurs, portAnswers, readInstance, sleep } from "./instance";

function stopGroup(pid: number, signal: NodeJS.Signals) {
  try {
    process.kill(-pid, signal);
  } catch {
    // The group is already gone.
  }
}

async function cleanup(): Promise<number> {
  const instance = readInstance();
  if (!instance) {
    console.log("nothing to clean: no instance started by launch.ts");
    return 0;
  }
  const { pid, port, root } = instance;
  const ours = isOurs(instance);
  if (ours && process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    } catch {
      // It exited after isOurs looked; the port check below still runs.
    }
  } else if (ours) {
    stopGroup(pid, "SIGTERM");
    for (let second = 0; second < 10 && isAlive(pid); second++) await sleep(1_000);
    stopGroup(pid, "SIGKILL");
  }
  // Holds only the state file and dev logs, so no path from the file is trusted.
  rmSync(INSTANCE_DIR, { recursive: true, force: true });

  if (!ours) {
    console.log(`nothing stopped: pid ${pid} no longer runs the server launch.ts started, so the state file was stale. Removed it.`);
  } else {
    for (let second = 0; second < 5 && (await portAnswers(port)); second++) await sleep(1_000);
    if (await portAnswers(port)) {
      console.log(`WARNING: port ${port} still answers`);
      return 1;
    }
    console.log(`stopped pid ${pid} and its children, port ${port} free`);
  }
  const evidence = join(root, ".cache/verify-turnpoint");
  console.log(`evidence kept: ${evidence}`);
  try {
    for (const run of readdirSync(evidence).sort().slice(-5)) console.log(`  ${run}`);
  } catch {
    // No journeys ran.
  }
  return 0;
}

cleanup().then((code) => process.exit(code));
