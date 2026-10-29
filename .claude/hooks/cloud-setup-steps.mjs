// Helpers for cloud-setup.mjs, in their own file so cloud-setup.test.mjs can
// test them without installing anything.

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
// output. `packagesCurrent` says whether node_modules already matches
// package-lock.json, as in a resumed session on the same machine, so npm ci
// can be skipped; it's only asked in the cloud. Returns the line to print, or
// "" outside the cloud, where nothing runs.
export function cloudSetup(env, run, packagesCurrent = () => false) {
  if (env.CLAUDE_CODE_REMOTE !== "true") return "";
  const skipInstall = packagesCurrent();
  const steps = skipInstall ? [BROWSER] : [INSTALL, BROWSER];
  for (const step of steps) {
    const { ok, tail } = run(step);
    if (!ok) {
      return `Cloud setup: \`${step}\` failed, so ${NEEDED_FOR[step]} won't work until it's run again. Its last lines:\n${tail}`;
    }
  }
  const ran = steps.map((step) => `\`${step}\``).join(" and ");
  return `Cloud setup: ran ${ran}${skipInstall ? " (node_modules already matched package-lock.json)" : ""}.`;
}
