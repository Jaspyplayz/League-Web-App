// The decisions behind the Agent merge workflow (JAS-121,
// .github/workflows/agent-merge.yml), kept pure so they're tested without
// GitHub. scripts/can-merge-action.ts reads the event and calls GitHub.
//
// When CI, Reviewer, Smoke test or Dependency review finishes on a branch,
// the workflow finds the branch's open PR and, once its builder has marked it
// ready, runs `can-merge --merge` on it. can-merge decides everything else;
// this only picks which PR to ask about and reads what its exit code meant.

import { z } from "zod";
import { field, REFUSED_EXIT_CODE } from "./can-merge-gates";

// The part of GitHub's workflow_run event this reads. head_branch is null
// for some events, and head_repository once a fork is deleted.
export const WorkflowRunEvent = z.object({
  workflow_run: z.object({
    name: z.string(),
    head_branch: z.string().nullable(),
    head_repository: z.object({ full_name: z.string() }).nullable(),
  }),
});
export type WorkflowRunEvent = z.infer<typeof WorkflowRunEvent>;

export type Target = { branch: string } | { skip: string };

// Only Claude's branches in this repo. The workflow's `if:` skips the rest
// before a runner even starts; this repeats it so the script is safe on its
// own. A Smoke test run's repo is always this one, even for a fork's PR, so
// the real fork guards are the PR lookup below and can-merge's own
// "Built by Claude Code" gate.
export function branchToTry(event: WorkflowRunEvent, repository: string): Target {
  const { head_branch: branch, head_repository: repo } = event.workflow_run;
  if (!branch) return { skip: "the run has no branch" };
  if (!branch.startsWith("claude/")) return { skip: `${branch} doesn't start with claude/` };
  if (repo?.full_name !== repository) return { skip: `${branch} is in ${repo?.full_name ?? "a deleted fork"}, not ${repository}` };
  return { branch };
}

// GET repos/{owner}/{repo}/pulls?state=open&head={owner}:{branch}. Without
// the owner GitHub ignores the filter, so it's always there.
export function openPullsPath(repository: string, branch: string): string {
  const owner = repository.split("/")[0];
  return `repos/${repository}/pulls?state=open&head=${encodeURIComponent(`${owner}:${branch}`)}`;
}

export const OpenPulls = z.array(
  z.object({
    number: z.number(),
    body: z.string().nullable(),
    head: z.object({
      ref: z.string(),
      sha: z.string(),
      // null once a fork's repository is deleted.
      repo: z.object({ full_name: z.string() }).nullable(),
    }),
  }),
);
export type OpenPull = z.infer<typeof OpenPulls>[number];

// GitHub's answer should hold only this branch's PR in this repo. Checking it
// again means a filter GitHub ever ignored can't send can-merge other PRs.
export function pullsOnBranch(pulls: OpenPull[], branch: string, repository: string): OpenPull[] {
  return pulls.filter(({ head }) => head.ref === branch && head.repo?.full_name === repository);
}

export const READY_LABEL = "Ready to merge";

// The builder's say-so that its own steps are done (docs/workflow.md steps
// 7 to 10), since every gate can pass before then: a tiny PR's checks can
// finish before its screenshots, and a normal PR's verdict before its
// postmortem entry. It's `**Ready to merge:** yes at <head sha>`, so a push
// after it, such as a postmortem entry for a failure the builder then
// found, holds the PR again until the builder names the new head. Anything
// else, or no such line, holds it. Changing it edits the description, which
// reruns the Reviewer workflow, which runs this again. It isn't a can-merge
// gate, so a session running can-merge itself isn't held by it.
export function readyToMerge(body: string | null, headSha: string): { ready: true } | { ready: false; why: string } {
  const line = field(body ?? "", READY_LABEL);
  if (!("value" in line)) return { ready: false, why: line.why };
  const named = line.value.match(/^yes at ([0-9a-f]{7,40})\.?$/i)?.[1].toLowerCase();
  if (!named) return { ready: false, why: `**${READY_LABEL}:** says "${line.value}", not "yes at <head sha>"` };
  if (!headSha.toLowerCase().startsWith(named)) {
    return { ready: false, why: `**${READY_LABEL}:** names ${named}, but the head is ${headSha.slice(0, 7)}` };
  }
  return { ready: true };
}

// Which of GitHub's answers to hand to can-merge: the branch's PRs in this
// repo whose builder marked their head ready. The rest are held, with why.
export function pullsToMerge(
  pulls: OpenPull[],
  branch: string,
  repository: string,
): { ready: number[]; held: { number: number; why: string }[] } {
  const ready: number[] = [];
  const held: { number: number; why: string }[] = [];
  for (const pull of pullsOnBranch(pulls, branch, repository)) {
    const verdict = readyToMerge(pull.body, pull.head.sha);
    if (verdict.ready) ready.push(pull.number);
    else held.push({ number: pull.number, why: verdict.why });
  }
  return { ready, held };
}

export type Outcome = "passed" | "refused" | "crashed";

// What can-merge's exit code means. A refusal is normal: most runs finish
// while another check is still going, and the last one to finish merges.
// null is a run killed by a signal or one that never started, which counts
// as a crash.
export function outcomeOf(exitCode: number | null): Outcome {
  if (exitCode === 0) return "passed";
  if (exitCode === REFUSED_EXIT_CODE) return "refused";
  return "crashed";
}

// A crash before the merge is often a race, not a bug: the builder pushed
// mid-check, or another branch merged first and GitHub answered "Base branch
// was modified". This run may be the PR's last trigger, so it tries once more.
// A crash after the merge (the comment or label failed) isn't retried, since
// can-merge would only find the PR merged.
export const ATTEMPTS = 2;

export function shouldRetry(outcome: Outcome, merged: boolean, attempt: number): boolean {
  return outcome === "crashed" && !merged && attempt < ATTEMPTS;
}

// GitHub doesn't start workflows for anything this job's token does, so a
// merge from here gets no CI run on main, the run that catches two PRs that
// pass alone but break main together. workflow_dispatch is the exception
// GitHub makes for that token (JAS-123, docs/adr/0024), so after each merge
// the script asks GitHub to start ci.yml on main this way. These are gh's
// arguments: -f sends {"ref": "main"} as the JSON body, and GitHub answers
// 204 with no body.
export function mainCiDispatchArgs(repository: string): string[] {
  return ["api", "-X", "POST", `repos/${repository}/actions/workflows/ci.yml/dispatches`, "-f", "ref=main"];
}

// One try of can-merge: its exit code (null if it never ran or was killed),
// and why, in words, for the log.
export type CanMergeRun = { status: number | null; why: string };

// Everything merging one PR does outside this file, passed in so the tests
// can fake GitHub. startMainCi throws if GitHub refuses.
export type MergeEffects = {
  runCanMerge: (attempt: number) => CanMergeRun;
  isMerged: () => boolean;
  waitBeforeRetry: () => void;
  startMainCi: () => void;
  log: (line: string) => void;
  summary: (line: string) => void;
};

// Runs can-merge on one ready PR, tries a crash before the merge once more,
// and starts CI on main whenever the PR merged. `failed` turns the run red,
// so Jasper sees it: two crashes, a step after the merge failing, or GitHub
// refusing to start CI.
export function mergePull(number: number, effects: MergeEffects): { failed: boolean } {
  let crash = ""; // why the last try crashed, if one did
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const run = effects.runCanMerge(attempt);
    const outcome = outcomeOf(run.status);
    if (outcome === "passed") {
      effects.summary(`#${number}: every gate passed and can-merge merged it.`);
      return { failed: !dispatchMainCi(number, effects) };
    }
    if (outcome === "refused") {
      // After a crash, can-merge also refuses a PR that's no longer open: the
      // crash came after the merge, but GitHub couldn't say so at the time.
      if (crash && effects.isMerged()) return mergedThenCrashed(number, crash, effects);
      effects.summary(`#${number}: not merged, since a gate failed (the log above lists each one). A later check may still merge it.`);
      effects.log(`::notice title=Not merged::#${number}: can-merge refused. See the gate lines in the log.`);
      return { failed: false };
    }
    crash = run.why;
    const merged = effects.isMerged();
    if (merged) return mergedThenCrashed(number, crash, effects);
    if (!shouldRetry(outcome, merged, attempt)) break;
    effects.log(`can-merge crashed (${crash}) before merging, which is often a race. Trying again in 30 seconds.`);
    effects.waitBeforeRetry();
  }
  effects.summary(`#${number}: can-merge crashed (${crash}) and wasn't merged. The log above says why.`);
  return { failed: true };
}

// The comment or label failed after the merge. Main still changed, so its CI
// still needs to run, and the run is red either way.
function mergedThenCrashed(number: number, why: string, effects: MergeEffects): { failed: boolean } {
  effects.summary(`#${number}: merged, but a step after the merge failed (${why}). The log above says which.`);
  dispatchMainCi(number, effects);
  return { failed: true };
}

// Returns whether GitHub accepted. A refusal can't undo the merge, so the
// summary says the PR merged and how to start CI by hand.
function dispatchMainCi(number: number, effects: MergeEffects): boolean {
  try {
    effects.startMainCi();
    effects.summary(`#${number}: started CI on main for the merge.`);
    return true;
  } catch (error) {
    // execFileSync's message starts with the whole command; gh's own error
    // is its last line.
    const message = error instanceof Error ? error.message : String(error);
    const why = message.trim().split("\n").at(-1);
    effects.summary(
      `#${number}: merged, but starting CI on main failed (${why}), so main's CI hasn't run on it. Start it from the Actions tab: CI, Run workflow, on main.`,
    );
    effects.log(`::error title=CI on main not started::#${number} merged, but GitHub didn't start CI on main. The run's summary says what to do.`);
    return false;
  }
}
