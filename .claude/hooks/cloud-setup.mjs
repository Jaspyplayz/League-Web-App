// Claude Code hook: install the app's packages and Playwright's Chromium when
// a cloud session starts or is reopened.
//
// A cloud session starts on a fresh machine with only the repo cloned, and a
// session reopened after its machine expired gets a fresh one too, so lint,
// the tests and `npm run shot` can't run until these are installed. On
// Jasper's computer they already are, and `npm ci` would delete node_modules
// and start over, so the hook does nothing unless Claude Code says it's
// running in the cloud: it sets CLAUDE_CODE_REMOTE to "true" there and never
// locally (https://code.claude.com/docs/en/hooks).
//
// Claude Code adds what a SessionStart hook prints to Claude's context, so the
// installs' own output goes to stderr and only one summary line is printed,
// with the last lines of output when a step fails.

import { spawnSync } from "node:child_process";
import { cloudSetup, markPackagesCurrent, packagesCurrent } from "./cloud-setup-steps.mjs";

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();

// Each step gets under half of the hook's 600-second timeout, so a stalled
// download still ends in a line Claude can read.
const STEP_TIMEOUT_MS = 280_000;

function run(command) {
  const result = spawnSync(command, {
    shell: true,
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
    timeout: STEP_TIMEOUT_MS,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  process.stderr.write(output);
  const ok = result.status === 0;
  const lines = output.trimEnd().split("\n").slice(-5);
  if (result.error) lines.push(result.error.message);
  return { ok, tail: lines.join("\n") };
}

const line = cloudSetup(process.env, run, {
  current: () => packagesCurrent(root),
  markCurrent: () => markPackagesCurrent(root),
});
if (line) console.log(line);
