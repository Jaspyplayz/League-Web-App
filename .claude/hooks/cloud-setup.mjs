// Claude Code hook: install the app's packages and Playwright's Chromium when
// a cloud session starts.
//
// A cloud session starts on a fresh machine with only the repo cloned, so lint,
// the tests and `npm run shot` can't run until these are installed. On Jasper's
// computer they already are, and `npm ci` would delete node_modules and start
// over, so the hook does nothing unless Claude Code says it's running in the
// cloud: it sets CLAUDE_CODE_REMOTE to "true" there and never locally
// (https://code.claude.com/docs/en/hooks).
//
// Claude Code adds what a SessionStart hook prints to Claude's context, so the
// installs' own output goes to stderr and only one summary line is printed.

import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const STEPS = ["npm ci", "npx playwright install chromium"];

// Runs each step in order and stops at the first one that fails. `run` takes a
// command and returns whether it succeeded. Returns the line to print, or ""
// outside the cloud, where nothing runs.
export function cloudSetup(env, run) {
  if (env.CLAUDE_CODE_REMOTE !== "true") return "";
  for (const step of STEPS) {
    if (!run(step)) {
      return `Cloud setup: \`${step}\` failed (its output is in the hook's stderr). Run it again before lint, tests or npm run shot.`;
    }
  }
  return `Cloud setup: ran ${STEPS.map((step) => `\`${step}\``).join(" and ")}.`;
}

function runStep(command) {
  const result = spawnSync(command, {
    shell: true,
    cwd: process.env.CLAUDE_PROJECT_DIR || process.cwd(),
    // The child's stdout and stderr both go to our stderr (file descriptor 2).
    stdio: ["ignore", 2, 2],
  });
  return result.status === 0;
}

// Run only when Claude Code starts this file, not when the test imports it.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const line = cloudSetup(process.env, runStep);
  if (line) console.log(line);
}
