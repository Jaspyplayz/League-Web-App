// Claude Code hook: install the app's packages and Playwright's Chromium when
// a cloud session starts, is reopened or is forked.
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

import { cloudSetup, markPackagesCurrent, packagesCurrent, runStep, STEP_TIMEOUT_MS } from "./cloud-setup-steps.mjs";

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();

const line = cloudSetup(process.env, (command) => runStep(command.split(" "), root, STEP_TIMEOUT_MS), {
  current: () => packagesCurrent(root),
  markCurrent: () => markPackagesCurrent(root),
});
if (line) console.log(line);
