// Turns GitHub's REST answers about a PR into the snapshot the gates in
// scripts/can-merge-gates.ts check (JAS-26, docs/adr/0013). can-merge used to
// ask `gh pr view`, which goes through GitHub's GraphQL API, and a cloud
// session's GitHub proxy refuses GraphQL. Everything here is pure, so it's
// tested on saved REST answers in scripts/can-merge-fixtures/.
// scripts/can-merge.ts fetches them with `gh api`.

import { z } from "zod";
import { MERGE_MARKER, type Check, type CheckState, type PrSnapshot } from "./can-merge-gates";

// GET repos/{owner}/{repo}/pulls/{n}. Only the fields the gates read.
export const Pull = z.object({
  number: z.number(),
  title: z.string(),
  state: z.enum(["open", "closed"]),
  draft: z.boolean(),
  merged: z.boolean(),
  user: z.object({ login: z.string(), type: z.string() }),
  body: z.string().nullable(),
  head: z.object({
    ref: z.string(),
    sha: z.string(),
    user: z.object({ login: z.string() }),
    // null once a fork's repository is deleted.
    repo: z.object({ id: z.number() }).nullable(),
  }),
  base: z.object({ ref: z.string(), sha: z.string(), repo: z.object({ id: z.number() }) }),
});
export type Pull = z.infer<typeof Pull>;

// GET repos/{owner}/{repo}/commits/{sha}/check-runs: GitHub Actions jobs and
// other apps' checks, such as CodeQL and Vercel Preview Comments.
const CheckRun = z.object({
  name: z.string(),
  status: z.string(),
  conclusion: z.string().nullable(),
  started_at: z.iso.datetime().nullable(),
  check_suite: z.object({ id: z.number() }),
});
export type CheckRun = z.infer<typeof CheckRun>;
export const CheckRunPage = z.object({ total_count: z.number(), check_runs: z.array(CheckRun) });

// GET repos/{owner}/{repo}/actions/runs?head_sha={sha}. `name` is the
// workflow's name, such as "CI".
const WorkflowRun = z.object({ name: z.string(), check_suite_id: z.number() });
export type WorkflowRun = z.infer<typeof WorkflowRun>;
export const WorkflowRunPage = z.object({ total_count: z.number(), workflow_runs: z.array(WorkflowRun) });

// GET repos/{owner}/{repo}/commits/{sha}/status: the latest commit status of
// each name. Vercel's deployment check is one.
const CommitStatus = z.object({ context: z.string(), state: z.string(), target_url: z.string().nullable() });
export type CommitStatus = z.infer<typeof CommitStatus>;
export const StatusPage = z.object({ total_count: z.number(), statuses: z.array(CommitStatus) });

/** Every REST answer can-merge reads about one PR, at its head commit. */
export type RestAnswers = {
  pull: Pull;
  checkRuns: CheckRun[];
  workflowRuns: WorkflowRun[];
  statuses: CommitStatus[];
};

/** The PR as the gates see it, plus what the merge commit's message needs. */
export type Pr = PrSnapshot & { title: string; headOwner: string };

// `files` comes from git, not GitHub (scripts/can-merge-files.ts).
export function toPrSnapshot({ pull, ...checks }: RestAnswers, files: string[]): Pr {
  return {
    number: pull.number,
    title: pull.title,
    state: pull.merged ? "MERGED" : pull.state === "open" ? "OPEN" : "CLOSED",
    isDraft: pull.draft,
    isCrossRepository: pull.head.repo === null || pull.head.repo.id !== pull.base.repo.id,
    baseRefName: pull.base.ref,
    headRefName: pull.head.ref,
    headRefOid: pull.head.sha,
    // The head branch's owner, which GitHub's own merge subject names.
    headOwner: pull.head.user.login,
    author: { login: pull.user.login, isBot: pull.user.type === "Bot" },
    body: pull.body ?? "",
    files,
    checks: toChecks(checks),
  };
}

// A check run doesn't say which workflow it came from, but it belongs to a
// check suite, and each workflow run has its own suite (a re-run keeps it).
// A check run from an app such as CodeQL has no workflow run, so its workflow
// is "". GitHub runs a check again on each push, description edit and re-run,
// and lists every run. The merge box counts only the latest run of each, so
// the gates do too. Runs that started in the same second all count.
export function toChecks({ checkRuns, workflowRuns, statuses }: Omit<RestAnswers, "pull">): Check[] {
  const workflowOf = new Map(workflowRuns.map((run) => [run.check_suite_id, run.name]));
  const runs = checkRuns.map((run) => ({ run, workflow: workflowOf.get(run.check_suite.id) ?? "" }));
  const key = ({ run, workflow }: (typeof runs)[number]) => JSON.stringify([workflow, run.name]);
  const latest = new Map<string, number>();
  for (const entry of runs) latest.set(key(entry), Math.max(latest.get(key(entry)) ?? -Infinity, started(entry.run)));
  return [
    ...runs
      .filter((entry) => started(entry.run) === latest.get(key(entry)))
      .map(({ run, workflow }): Check => ({
        kind: "run",
        name: run.name,
        workflow,
        state: checkRunState(run.status, run.conclusion),
      })),
    ...statuses.map(
      (status): Check => ({
        kind: "status",
        name: status.context,
        url: status.target_url ?? "",
        state: statusState(status.state),
      }),
    ),
  ];
}

// A queued run is the newest, and a run cancelled before it started never ran.
function started(run: CheckRun): number {
  if (run.started_at !== null) return Date.parse(run.started_at);
  return run.status === "completed" ? -Infinity : Infinity;
}

function statusState(state: string): CheckState {
  if (state === "success") return "success";
  if (state === "pending") return "pending";
  return "failure";
}

function checkRunState(status: string, conclusion: string | null): CheckState {
  if (status !== "completed") return "pending";
  if (conclusion === "success") return "success";
  if (conclusion === "neutral" || conclusion === "skipped") return "skipped";
  return "failure";
}

// PUT repos/{owner}/{repo}/pulls/{n}/merge. GitHub refuses it if the head
// moved past `sha`, so only the commit the gates checked can merge. The
// subject is GitHub's usual one, and the marker is what the revert gate finds.
export function mergeRequest(pr: Pr): { path: string; body: Record<string, string> } {
  return {
    path: `repos/{owner}/{repo}/pulls/${pr.number}/merge`,
    body: {
      sha: pr.headRefOid,
      merge_method: "merge",
      commit_title: `Merge pull request #${pr.number} from ${pr.headOwner}/${pr.headRefName}`,
      commit_message: `${pr.title}\n\n${MERGE_MARKER}`,
    },
  };
}
