// The mechanical half of the codebase wellness check (docs/wellness.md): the
// range of commits since the last run, how long the tests and the build take,
// and the code TypeScript says nothing reads. It needs no human input, so the
// cloud routine runs it every two weeks; Jasper can run it locally too.
//
//   npx tsx scripts/wellness.ts
//
// Run it from a checkout of main. It prints a report, saves the same report to
// the git-ignored .cache/wellness/, and ends with the Runs-table row to add once
// the run's tickets exist. It changes no tracked file.

import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { formatRow, lastRun, parseTsc } from "./wellness-steps";

function git(...args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

// Runs a command through the shell (npm and npx are .cmd files on Windows) and
// times it. Output is kept so a failure can be shown.
function timed(command: string, env: NodeJS.ProcessEnv = process.env): { seconds: number; ok: boolean; output: string } {
  const start = Date.now();
  const run = spawnSync(command, { shell: true, encoding: "utf8", env, maxBuffer: 64 * 1024 * 1024 });
  const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  return { seconds: (Date.now() - start) / 1000, ok: run.status === 0, output };
}

function tail(output: string, lines = 15): string {
  return output.trimEnd().split(/\r?\n/).slice(-lines).join("\n");
}

// The local date (en-CA writes YYYY-MM-DD), so it matches the day the run's branch is named after.
const date = new Date().toLocaleDateString("en-CA");
// Cloud sessions set CLAUDE_CODE_REMOTE, the same flag the cloud setup hook checks.
const ranIn = process.env.CLAUDE_CODE_REMOTE === "true" ? "cloud" : "local";
git("fetch", "--quiet", "origin");
const head = git("rev-parse", "--short", "origin/main");
const last = lastRun(readFileSync("docs/wellness.md", "utf8"));
// Before the first run there's no row to start from, so look back 14 days.
const base = last?.commit ?? git("rev-list", "-1", "--before=14 days ago", "origin/main").slice(0, 7);
const commits = git("rev-list", "--count", `${base}..${head}`);
const shortstat = git("diff", "--shortstat", `${base}..${head}`) || "no changes";

console.error("Running npm test...");
const test = timed("npm test");
console.error("Running npm run build...");
// Without the token, Sentry's build plugin skips uploading source maps for a build nothing deploys.
const build = timed("npm run build", { ...process.env, SENTRY_AUTH_TOKEN: "" });
// After the build, so the route types Next.js generates exist for tsc.
console.error("Scanning for unused code...");
const tsc = parseTsc(timed("npx tsc --noEmit --noUnusedLocals --noUnusedParameters -p tsconfig.json").output);

const time = (r: { seconds: number; ok: boolean }) => (r.ok ? `${Math.round(r.seconds)} s` : "failed");
// Only a run from the same place is a fair comparison: a cloud machine starts with no build cache.
const comparable = last?.ranIn === ranIn ? last : undefined;
const before = (s: number | null | undefined) =>
  s === undefined ? `no earlier ${ranIn} run` : s === null ? "failed" : `${s} s`;

const report = [
  `# Wellness run ${date}`,
  "",
  `Range: \`${base}..${head}\`, ${commits} commits, ${shortstat}. Check 1 reviews \`git diff ${base}..${head}\`.`,
  "",
  "## Speed",
  "",
  `| | This run (${ranIn}) | Last ${ranIn} run |`,
  "|---|---|---|",
  `| \`npm test\` | ${time(test)} | ${before(comparable?.testSeconds)} |`,
  `| \`npm run build\` | ${time(build)} | ${before(comparable?.buildSeconds)} |`,
  ...(test.ok ? [] : ["", "`npm test` failed:", "", "```", tail(test.output), "```"]),
  ...(build.ok ? [] : ["", "`npm run build` failed:", "", "```", tail(build.output), "```"]),
  "",
  `## Unused code (${tsc.unused.length})`,
  "",
  ...(tsc.unused.length > 0 ? tsc.unused.map((u) => `- \`${u.file}:${u.line}\`: ${u.message}`) : ["None found."]),
  ...(tsc.otherErrors > 0 ? ["", `TypeScript also reported ${tsc.otherErrors} other errors; \`npm run typecheck\` shows them.`] : []),
  "",
  "## Runs row",
  "",
  "Replace the tickets once they exist:",
  "",
  formatRow({
    date,
    ranIn,
    commit: head,
    tickets: [],
    testSeconds: test.ok ? test.seconds : null,
    buildSeconds: build.ok ? build.seconds : null,
    notes: "",
  }),
  "",
].join("\n");

mkdirSync(".cache/wellness", { recursive: true });
writeFileSync(`.cache/wellness/${date}.md`, report);
console.log(report);
