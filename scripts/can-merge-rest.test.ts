import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decide, MERGE_MARKER, type CheckState, type Decision, type MainState } from "./can-merge-gates";
import {
  CheckRunPage,
  mergeRequest,
  Pull,
  StatusPage,
  toChecks,
  toPrSnapshot,
  WorkflowRunPage,
  type CheckRun,
  type RestAnswers,
} from "./can-merge-rest";

// Saved REST answers (scripts/can-merge-fixtures/README.md says where each
// came from). #195 is a Claude PR on this repo, #188 Dependabot's, and the two
// cli/cli PRs are a draft and a fork, which this repo has never had.
function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`./can-merge-fixtures/${name}`, import.meta.url), "utf8"));
}

const PR_195 = Pull.parse(fixture("pull-195.json"));
const CHECKS_195 = {
  checkRuns: CheckRunPage.parse(fixture("check-runs-195.json")).check_runs,
  workflowRuns: WorkflowRunPage.parse(fixture("workflow-runs-195.json")).workflow_runs,
  statuses: StatusPage.parse(fixture("status-195.json")).statuses,
};
const FILES = ["docs/workflow.md", ".claude/settings.json"];
const VERCEL = "https://vercel.com/jaspy-s-team/league-web-app/3SCMwZ9eicHYo7PXABLx2mgQUL3h";
const STARTED = "2026-10-26T05:59:13Z";
const RAN_AGAIN = "2026-10-26T06:02:40Z";

function answers(overrides: Partial<RestAnswers> = {}): RestAnswers {
  return { pull: PR_195, ...CHECKS_195, ...overrides };
}

const MAIN: MainState = { agentMerge: { on: true, since: "2026-10-25" }, changedGateCode: [], reverts: [], claudeMerges: [] };

function gate(decision: Decision, name: string) {
  return decision.gates.find((gate) => gate.name === name);
}

describe("toPrSnapshot", () => {
  it("reads a Claude PR's REST answers as the gates' snapshot", () => {
    const { checks, body, ...rest } = toPrSnapshot(answers(), FILES);
    expect(rest).toEqual({
      number: 195,
      title: "docs(workflow): Claude-only workflow, up to 4 builders, Ready queue, Cursor removed (JAS-27)",
      state: "MERGED",
      isDraft: false,
      isCrossRepository: false,
      baseRefName: "main",
      headRefName: "claude/jas-27-claude-only-workflow",
      headRefOid: "a18e2fcea10f2374e3a120d94192d6997b4ce027",
      headOwner: "Jaspyplayz",
      author: { login: "Jaspyplayz", isBot: false },
      files: FILES,
    });
    expect(body).toMatch(/^\*\*Tier:\*\* risky\./);
    // The latest run of each check, with the workflow each came from. CodeQL's
    // default setup names its workflow run after the PR.
    expect(checks).toEqual([
      { kind: "run", name: "reviewer", workflow: "Reviewer", state: "success" },
      { kind: "run", name: "smoke", workflow: "Smoke test", state: "success" },
      { kind: "run", name: "Vercel Preview Comments", workflow: "", state: "success" },
      { kind: "run", name: "CodeQL", workflow: "", state: "success" },
      { kind: "run", name: "check", workflow: "CI", state: "success" },
      { kind: "run", name: "dependency-review", workflow: "Dependency review", state: "success" },
      { kind: "run", name: "Analyze (javascript-typescript)", workflow: "PR #195", state: "success" },
      { kind: "run", name: "Analyze (actions)", workflow: "PR #195", state: "success" },
      { kind: "status", name: "Vercel", url: VERCEL, state: "success" },
    ]);
  });

  it("passes #195's checks and refuses it as already merged", () => {
    const decision = decide(toPrSnapshot(answers(), FILES), MAIN);
    expect(gate(decision, "Checks pass at the head commit")?.pass).toBe(true);
    expect(gate(decision, "Open and ready")).toMatchObject({ pass: false, detail: "the PR is merged" });
  });

  it("reads a draft", () => {
    const pr = toPrSnapshot(answers({ pull: Pull.parse(fixture("pull-cli-14783-draft.json")) }), FILES);
    expect(pr).toMatchObject({ state: "OPEN", isDraft: true, baseRefName: "trunk" });
  });

  it("reads a missing description as empty", () => {
    expect(toPrSnapshot(answers({ pull: Pull.parse(fixture("pull-cli-14783-draft.json")) }), FILES).body).toBe("");
  });

  it("reads a PR from a fork as cross-repository", () => {
    const pull = Pull.parse(fixture("pull-cli-14689-fork.json"));
    expect(toPrSnapshot(answers({ pull }), FILES)).toMatchObject({
      isCrossRepository: true,
      isDraft: false,
      headOwner: "rajpreetcodes",
    });
  });

  // GitHub sends a null head repository once the fork is deleted.
  it("reads a PR from a deleted fork as cross-repository", () => {
    const pull = Pull.parse(fixture("pull-cli-14689-fork.json"));
    const pr = toPrSnapshot(answers({ pull: { ...pull, head: { ...pull.head, repo: null } } }), FILES);
    expect(pr.isCrossRepository).toBe(true);
  });

  it("reads a bot author", () => {
    const pr = toPrSnapshot(answers({ pull: Pull.parse(fixture("pull-188-dependabot.json")) }), FILES);
    expect(pr.author).toEqual({ login: "dependabot[bot]", isBot: true });
    expect(gate(decide(pr, MAIN), "Built by Claude Code")?.detail).toContain("opened by a bot (dependabot[bot])");
  });

  it("reads a closed PR that didn't merge as closed", () => {
    const pr = toPrSnapshot(answers({ pull: { ...PR_195, merged: false } }), FILES);
    expect(pr.state).toBe("CLOSED");
  });

  // A workflow can name a job "check" too, so only the CI workflow's counts.
  it("doesn't count a check named check from another workflow", () => {
    const reviewerSuite = CHECKS_195.workflowRuns.find((run) => run.name === "Reviewer")!.check_suite_id;
    const checkRuns = CHECKS_195.checkRuns.map((run) =>
      run.name === "check" ? { ...run, check_suite: { id: reviewerSuite } } : run,
    );
    const decision = decide(toPrSnapshot(answers({ checkRuns }), FILES), MAIN);
    expect(gate(decision, "Checks pass at the head commit")).toMatchObject({
      pass: false,
      detail: "check hasn't reported from the CI workflow",
    });
  });

  it("refuses when CI's check failed and another workflow's check passed", () => {
    const ci = CHECKS_195.workflowRuns.find((run) => run.name === "CI")!;
    const other = { ...ci, name: "Quick checks", check_suite_id: 1 };
    const ciCheck = CHECKS_195.checkRuns.find((run) => run.name === "check")!;
    const checkRuns = [
      ...CHECKS_195.checkRuns.filter((run) => run !== ciCheck),
      { ...ciCheck, conclusion: "failure" },
      { ...ciCheck, started_at: "2026-10-29T05:00:00Z", check_suite: { id: 1 } },
    ];
    const pr = toPrSnapshot(answers({ checkRuns, workflowRuns: [...CHECKS_195.workflowRuns, other] }), FILES);
    expect(gate(decide(pr, MAIN), "Checks pass at the head commit")).toMatchObject({
      pass: false,
      detail: "check failed",
    });
  });
});

describe("toChecks", () => {
  const SUITES: Record<string, number> = { "Smoke test": 1, "Quick smoke": 2 };
  const run = (
    status: string,
    conclusion: string | null,
    started_at: string | null = STARTED,
    workflow = "Smoke test",
  ): CheckRun => ({ name: "smoke", status, conclusion, started_at, check_suite: { id: SUITES[workflow] } });
  const workflowRuns = Object.entries(SUITES).map(([name, check_suite_id]) => ({ name, check_suite_id }));
  const status = (state: string) => ({ context: "Vercel", state, target_url: VERCEL });
  const states = (checkRuns: CheckRun[], statuses: ReturnType<typeof status>[] = []) =>
    toChecks({ checkRuns, workflowRuns, statuses }).map((check) => check.state);

  it.each<[string, CheckRun, CheckState]>([
    ["a running check", run("in_progress", null), "pending"],
    ["a queued check", run("queued", null), "pending"],
    ["a passed check", run("completed", "success"), "success"],
    ["a skipped check", run("completed", "skipped"), "skipped"],
    ["a cancelled check", run("completed", "cancelled"), "failure"],
    ["a timed-out check", run("completed", "timed_out"), "failure"],
  ])("reads %s as %s", (_, entry, state) => {
    expect(states([entry])).toEqual([state]);
  });

  it.each<[string, string, CheckState]>([
    ["a pending status", "pending", "pending"],
    ["a passed status", "success", "success"],
    ["an errored status", "error", "failure"],
  ])("reads %s as %s", (_, state, expected) => {
    expect(states([], [status(state)])).toEqual([expected]);
  });

  it("keeps where each check came from", () => {
    expect(toChecks({ checkRuns: [run("completed", "success")], workflowRuns, statuses: [status("success")] })).toEqual([
      { kind: "run", name: "smoke", workflow: "Smoke test", state: "success" },
      { kind: "status", name: "Vercel", url: VERCEL, state: "success" },
    ]);
  });

  it.each<[string, CheckRun[], CheckState[]]>([
    ["a failed run passed when run again", [run("completed", "failure"), run("completed", "success", RAN_AGAIN)], ["success"]],
    ["a passed run failed when run again", [run("completed", "success"), run("completed", "failure", RAN_AGAIN)], ["failure"]],
    ["a newer run is queued", [run("completed", "success"), run("queued", null, RAN_AGAIN)], ["pending"]],
    ["a newer run is queued and has no start time", [run("completed", "success"), run("queued", null, null)], ["pending"]],
    ["a run was cancelled before it started", [run("completed", "cancelled", null), run("completed", "success")], ["success"]],
    ["two runs started in the same second", [run("completed", "success"), run("completed", "failure")], ["success", "failure"]],
    [
      "smoke ran in two workflows",
      [run("completed", "failure"), run("completed", "success", RAN_AGAIN, "Quick smoke")],
      ["failure", "success"],
    ],
  ])("keeps the latest run of each check when %s", (_, checkRuns, expected) => {
    expect(states(checkRuns)).toEqual(expected);
  });
});

describe("mergeRequest", () => {
  it("merges the checked head commit with a merge commit carrying the marker", () => {
    const pr = toPrSnapshot(answers(), FILES);
    expect(mergeRequest(pr)).toEqual({
      path: "repos/{owner}/{repo}/pulls/195/merge",
      body: {
        sha: "a18e2fcea10f2374e3a120d94192d6997b4ce027",
        merge_method: "merge",
        commit_title: "Merge pull request #195 from Jaspyplayz/claude/jas-27-claude-only-workflow",
        commit_message: `docs(workflow): Claude-only workflow, up to 4 builders, Ready queue, Cursor removed (JAS-27)\n\n${MERGE_MARKER}`,
      },
    });
  });
});
