// The Agent merge workflow's script (JAS-121, .github/workflows/agent-merge.yml).
// It reads the workflow_run event GitHub writes, finds the open PR on that
// branch, and runs `can-merge --merge` on it from this main checkout. A
// refusal leaves a notice and passes; only a crash fails the run, so a red
// run always means something for Jasper to look at.
//
// The PR's code never runs here: can-merge reads the PR through git and
// GitHub's REST API, and this checkout is main's.

import { spawnSync, execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { branchToTry, OpenPulls, openPullsPath, outcomeOf, WorkflowRunEvent } from "./can-merge-action-steps";

const eventPath = process.env.GITHUB_EVENT_PATH;
const repository = process.env.GITHUB_REPOSITORY;
if (!eventPath || !repository) {
  throw new Error("GITHUB_EVENT_PATH or GITHUB_REPOSITORY isn't set. GitHub Actions sets them; locally, run npm run can-merge.");
}

// The step summary is the box on the run's page, so a refusal is easy to find.
function summary(line: string) {
  console.log(line);
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (file) appendFileSync(file, `${line}\n`);
}

const event = WorkflowRunEvent.parse(JSON.parse(readFileSync(eventPath, "utf8")));
const target = branchToTry(event, repository);
if ("skip" in target) {
  summary(`Nothing to merge: ${target.skip}.`);
  process.exit(0);
}

const pulls = OpenPulls.parse(
  JSON.parse(execFileSync("gh", ["api", openPullsPath(repository, target.branch)], { encoding: "utf8" })),
);
if (pulls.length === 0) {
  summary(`Nothing to merge: ${target.branch} has no open PR.`);
  process.exit(0);
}

let crashed = false;
for (const { number } of pulls) {
  console.log(`\n${event.workflow_run.name} finished on ${target.branch}. Asking can-merge about #${number}.\n`);
  const result = spawnSync("npx", ["tsx", "scripts/can-merge.ts", String(number), "--merge"], { stdio: "inherit" });
  const outcome = outcomeOf(result.status);
  if (outcome === "passed") summary(`#${number}: every gate passed and can-merge merged it.`);
  if (outcome === "refused") {
    summary(`#${number}: not merged, since a gate failed (the log above lists each one). A later check may still merge it.`);
    console.log(`::notice title=Not merged::#${number}: can-merge refused. See the gate lines in the log.`);
  }
  if (outcome === "crashed") {
    crashed = true;
    summary(`#${number}: can-merge crashed (exit ${result.status ?? result.signal}). The log above says why.`);
  }
}
if (crashed) process.exit(1);
