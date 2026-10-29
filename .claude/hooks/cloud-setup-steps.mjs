// Helpers for cloud-setup.mjs, in their own file so cloud-setup.test.mjs can
// test them without installing anything.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// After a good npm ci, a hash of package.json and package-lock.json goes in
// node_modules, so a resumed session on the same machine skips the reinstall.
// npm ci deletes node_modules first, so a failed install leaves no mark and
// runs again.
const markFile = (root) => join(root, "node_modules", ".cloud-setup-lock-hash");

// null when there's no lockfile, so npm ci runs and reports that itself.
function packagesHash(root) {
  const lock = join(root, "package-lock.json");
  if (!existsSync(lock)) return null;
  const hash = createHash("sha256").update(readFileSync(lock));
  const manifest = join(root, "package.json");
  if (existsSync(manifest)) hash.update(readFileSync(manifest));
  return hash.digest("hex");
}

// The mark only saves a reinstall, so a file it can't read or write counts as
// "not current" and never stops the Chromium step or the summary line.
export function packagesCurrent(root) {
  try {
    const hash = packagesHash(root);
    return hash !== null && existsSync(markFile(root)) && readFileSync(markFile(root), "utf8") === hash;
  } catch {
    return false;
  }
}

export function markPackagesCurrent(root) {
  try {
    const hash = packagesHash(root);
    if (hash !== null) writeFileSync(markFile(root), hash);
  } catch {
    // The next start reinstalls, which is what would happen with no mark.
  }
}

// Each step gets under half of the hook's 600-second timeout, so a stalled
// download still ends in a line Claude can read.
export const STEP_TIMEOUT_MS = 280_000;

export const INSTALL = "npm ci";
export const BROWSER = "npx playwright install chromium";

// What each step is needed for, so the line Claude sees after a failure says
// what won't work yet.
const NEEDED_FOR = {
  [INSTALL]: "lint, typecheck, the tests and the build",
  [BROWSER]: "npm run shot and the browser tests",
};

// Runs one program with its arguments, such as ["npm", "ci"], and returns
// { ok, tail }: whether it exited 0, and its last 5 lines of output plus any
// error, such as a timeout. It runs the program directly, not through a shell,
// so the timeout stops the program itself rather than only a shell around it.
// That works on the Linux machines cloud sessions run on; on Windows, npm and
// npx would need a shell, but the hook never runs a step there. The output
// also goes to stderr, because Claude Code adds a SessionStart hook's stdout
// to Claude's context.
export function runStep([file, ...args], root, timeoutMs) {
  const result = spawnSync(file, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
    timeout: timeoutMs,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  process.stderr.write(output);
  const lines = output.trimEnd() ? output.trimEnd().split("\n").slice(-5) : [];
  if (result.error) lines.push(result.error.message);
  return { ok: result.status === 0, tail: lines.join("\n") };
}

// Runs the steps in order and stops at the first one that fails. `run` takes a
// command such as "npm ci" and returns { ok, tail }, like runStep. `packages.current` says
// whether node_modules already matches package.json and package-lock.json, as
// in a resumed session on the same machine, so npm ci can be skipped; it's only
// asked in the cloud. `packages.markCurrent` is called only after npm ci works,
// so a failed install is never skipped next time. Returns the line to print, or
// "" outside the cloud, where nothing runs.
export function cloudSetup(env, run, packages = { current: () => false, markCurrent: () => {} }) {
  if (env.CLAUDE_CODE_REMOTE !== "true") return "";
  const skipInstall = packages.current();
  const steps = skipInstall ? [BROWSER] : [INSTALL, BROWSER];
  for (const step of steps) {
    const { ok, tail } = run(step);
    if (!ok) {
      return `Cloud setup: \`${step}\` failed, so ${NEEDED_FOR[step]} won't work until it's run again. Its last lines:\n${tail}`;
    }
    if (step === INSTALL) packages.markCurrent();
  }
  const ran = steps.map((step) => `\`${step}\``).join(" and ");
  return `Cloud setup: ran ${ran}${skipInstall ? " (node_modules already matched package.json and package-lock.json)" : ""}.`;
}
