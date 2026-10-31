// The Agent merge workflow's script (JAS-121, .github/workflows/agent-merge.yml).
// It reads the workflow_run event GitHub writes, finds the open PR on that
// branch, and if its builder marked it ready, runs `can-merge --merge` on it
// from this main checkout. A refusal leaves a notice and passes; a crash that
// a second try doesn't fix fails the run, so it shows up for Jasper.
//
// The PR's code never runs here: can-merge reads the PR through git and
// GitHub's REST API, and this checkout is main's.

import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import {
  ATTEMPTS,
  branchToTry,
  OpenPulls,
  openPullsPath,
  outcomeOf,
  pullsToMerge,
  shouldRetry,
  WorkflowRunEvent,
} from "./can-merge-action-steps";

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

function api(path: string): unknown {
  return JSON.parse(execFileSync("gh", ["api", path], { encoding: "utf8" }));
}

// Whether GitHub says the PR is merged, so a crash after the merge isn't
// retried or reported as "not merged". If GitHub can't say, assume not.
function isMerged(number: number): boolean {
  try {
    return (api(`repos/${repository}/pulls/${number}`) as { merged?: unknown }).merged === true;
  } catch {
    return false;
  }
}

const event = WorkflowRunEvent.parse(JSON.parse(readFileSync(eventPath, "utf8")));
const target = branchToTry(event, repository);
if ("skip" in target) {
  summary(`Nothing to merge: ${target.skip}.`);
  process.exit(0);
}

const pulls = OpenPulls.parse(api(openPullsPath(repository, target.branch)));
const { ready, held } = pullsToMerge(pulls, target.branch, repository);
if (ready.length === 0 && held.length === 0) {
  summary(`Nothing to merge: ${target.branch} has no open PR.`);
  process.exit(0);
}
for (const { number, why } of held) {
  summary(`#${number}: not marked ready (${why}). The builder writes **Ready to merge:** yes at <head sha> as its last step.`);
}

let failed = false;
for (const number of ready) {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    console.log(`\n${event.workflow_run.name} finished on ${target.branch}. Asking can-merge about #${number} (try ${attempt}).\n`);
    const result = spawnSync("npx", ["tsx", "scripts/can-merge.ts", String(number), "--merge"], { stdio: "inherit" });
    const outcome = outcomeOf(result.status);
    if (outcome === "passed") {
      summary(`#${number}: every gate passed and can-merge merged it.`);
      break;
    }
    if (outcome === "refused") {
      summary(`#${number}: not merged, since a gate failed (the log above lists each one). A later check may still merge it.`);
      console.log(`::notice title=Not merged::#${number}: can-merge refused. See the gate lines in the log.`);
      break;
    }
    const why = result.error ? result.error.message : `exit ${result.status ?? result.signal}`;
    const merged = isMerged(number);
    if (shouldRetry(outcome, merged, attempt)) {
      console.log(`can-merge crashed (${why}) before merging, which is often a race. Trying again in 30 seconds.`);
      execFileSync("sleep", ["30"]);
      continue;
    }
    failed = true;
    summary(
      merged
        ? `#${number}: merged, but a step after the merge failed (${why}). The log above says which.`
        : `#${number}: can-merge crashed (${why}) and wasn't merged. The log above says why.`,
    );
    break;
  }
}
if (failed) process.exit(1);
