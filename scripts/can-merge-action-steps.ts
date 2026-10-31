// The decisions behind the Agent merge workflow (JAS-121,
// .github/workflows/agent-merge.yml), kept pure so they're tested without
// GitHub. scripts/can-merge-action.ts reads the event and calls GitHub.
//
// When CI, Reviewer, Smoke test or Dependency review finishes on a branch,
// the workflow finds the branch's open PR and runs `can-merge --merge` on it.
// can-merge decides everything else; this only picks which PR to ask about
// and reads what its exit code meant.

import { z } from "zod";
import { REFUSED_EXIT_CODE } from "./can-merge-gates";

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
// own. A fork's branch can be called claude/ too, so the repo must match.
export function branchToTry(event: WorkflowRunEvent, repository: string): Target {
  const { head_branch: branch, head_repository: repo } = event.workflow_run;
  if (!branch) return { skip: "the run has no branch" };
  if (!branch.startsWith("claude/")) return { skip: `${branch} doesn't start with claude/` };
  if (repo?.full_name !== repository) return { skip: `${branch} is in ${repo?.full_name ?? "a deleted fork"}, not ${repository}` };
  return { branch };
}

// GET repos/{owner}/{repo}/pulls?state=open&head={owner}:{branch}. The head
// filter takes the owner's name, so a fork's PR with the same branch name
// isn't listed.
export function openPullsPath(repository: string, branch: string): string {
  const owner = repository.split("/")[0];
  return `repos/${repository}/pulls?state=open&head=${encodeURIComponent(`${owner}:${branch}`)}`;
}

export const OpenPulls = z.array(z.object({ number: z.number() }));

export type Outcome = "passed" | "refused" | "crashed";

// What can-merge's exit code means. A refusal is normal: most runs finish
// while another check is still going, and the last one to finish merges.
// null is a run killed by a signal, which counts as a crash.
export function outcomeOf(exitCode: number | null): Outcome {
  if (exitCode === 0) return "passed";
  if (exitCode === REFUSED_EXIT_CODE) return "refused";
  return "crashed";
}
