// Helpers for cloud-setup.mjs, in their own file so cloud-setup.test.mjs can
// test them without installing anything.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// After a good npm ci, the lockfile's hash goes in node_modules, so a resumed
// session on the same machine skips the reinstall. npm ci deletes
// node_modules first, so a failed install leaves no mark and runs again.
const markFile = (root) => join(root, "node_modules", ".cloud-setup-lock-hash");

// null when there's no lockfile, so npm ci runs and reports that itself.
function lockHash(root) {
  const lock = join(root, "package-lock.json");
  return existsSync(lock) ? createHash("sha256").update(readFileSync(lock)).digest("hex") : null;
}

export function packagesCurrent(root) {
  const hash = lockHash(root);
  return hash !== null && existsSync(markFile(root)) && readFileSync(markFile(root), "utf8") === hash;
}

export function markPackagesCurrent(root) {
  const hash = lockHash(root);
  if (hash !== null) writeFileSync(markFile(root), hash);
}

export const INSTALL = "npm ci";
export const BROWSER = "npx playwright install chromium";

// What each step is needed for, so the line Claude sees after a failure says
// what won't work yet.
const NEEDED_FOR = {
  [INSTALL]: "lint, typecheck, the tests and the build",
  [BROWSER]: "npm run shot and the browser tests",
};

// Runs the steps in order and stops at the first one that fails. `run` takes a
// command and returns { ok, tail }: whether it worked, and its last lines of
// output. `packages.current` says whether node_modules already matches
// package-lock.json, as in a resumed session on the same machine, so npm ci
// can be skipped; it's only asked in the cloud. `packages.markCurrent` is
// called only after npm ci works, so a failed install is never skipped next
// time. Returns the line to print, or "" outside the cloud, where nothing runs.
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
  return `Cloud setup: ran ${ran}${skipInstall ? " (node_modules already matched package-lock.json)" : ""}.`;
}
