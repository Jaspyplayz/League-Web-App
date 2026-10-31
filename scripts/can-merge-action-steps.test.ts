import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ATTEMPTS,
  branchToTry,
  mainCiDispatchArgs,
  mergePull,
  OpenPulls,
  openPullsPath,
  outcomeOf,
  pullsOnBranch,
  pullsToMerge,
  readyToMerge,
  shouldRetry,
  WorkflowRunEvent,
  type CanMergeRun,
  type OpenPull,
} from "./can-merge-action-steps";
import { REFUSED_EXIT_CODE } from "./can-merge-gates";

const REPO = "Jaspyplayz/League-Web-App";
const HEAD = "4d2a4fefeaef178f0565d274999c22b752383437";

// A Windows checkout ends lines with \r\n, and the patterns below match \n,
// so read every file the way CI on Linux sees it.
function source(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
}

function event(branch: string | null, repo: string | null = REPO): WorkflowRunEvent {
  return WorkflowRunEvent.parse({
    workflow_run: {
      name: "CI",
      head_branch: branch,
      head_repository: repo === null ? null : { full_name: repo },
      // GitHub sends many more fields; the schema keeps only these.
      head_sha: "8e1cd33ddeb5b5e08da1220ceacd5b2fb1e9ea6f",
    },
  });
}

function pull(number: number, ref: string, repo: string | null = REPO, body = "**Ready to merge:** yes at 4d2a4fe"): OpenPull {
  return { number, body, head: { ref, sha: HEAD, repo: repo === null ? null : { full_name: repo } } };
}

describe("branchToTry", () => {
  it("tries a Claude branch in this repo", () => {
    expect(branchToTry(event("claude/jas-121-agent-merge"), REPO)).toEqual({ branch: "claude/jas-121-agent-merge" });
  });

  it("skips main, Jasper's branches and Dependabot's", () => {
    for (const branch of ["main", "jaspyplayz/jas-121-thing", "dependabot/npm_and_yarn/next-16.1.0"]) {
      expect(branchToTry(event(branch), REPO)).toEqual({ skip: `${branch} doesn't start with claude/` });
    }
  });

  it("skips a fork's branch even when it's called claude/", () => {
    expect(branchToTry(event("claude/x", "someone/League-Web-App"), REPO)).toEqual({
      skip: "claude/x is in someone/League-Web-App, not Jaspyplayz/League-Web-App",
    });
    expect(branchToTry(event("claude/x", null), REPO)).toEqual({
      skip: "claude/x is in a deleted fork, not Jaspyplayz/League-Web-App",
    });
  });

  it("skips a run with no branch", () => {
    expect(branchToTry(event(null), REPO)).toEqual({ skip: "the run has no branch" });
  });
});

describe("finding the PR", () => {
  it("asks for open PRs from this repo's owner on that branch", () => {
    expect(openPullsPath(REPO, "claude/jas-121-agent-merge")).toBe(
      "repos/Jaspyplayz/League-Web-App/pulls?state=open&head=Jaspyplayz%3Aclaude%2Fjas-121-agent-merge",
    );
  });

  it("keeps a branch name from adding its own query fields", () => {
    expect(openPullsPath(REPO, "claude/x&state=closed")).toBe(
      "repos/Jaspyplayz/League-Web-App/pulls?state=open&head=Jaspyplayz%3Aclaude%2Fx%26state%3Dclosed",
    );
  });

  it("reads GitHub's answer", () => {
    const answer = [{ number: 240, title: "Agent merge", body: null, head: { ref: "claude/x", sha: HEAD, repo: { full_name: REPO } } }];
    expect(OpenPulls.parse(answer)).toEqual([{ number: 240, body: null, head: { ref: "claude/x", sha: HEAD, repo: { full_name: REPO } } }]);
  });

  it("keeps only the branch's PR in this repo, whatever GitHub answers", () => {
    const answer = [pull(1, "claude/x"), pull(2, "claude/y"), pull(3, "claude/x", "someone/League-Web-App"), pull(4, "claude/x", null)];
    expect(pullsOnBranch(answer, "claude/x", REPO).map(({ number }) => number)).toEqual([1]);
  });
});

describe("readyToMerge", () => {
  it("merges only once the builder names the head commit", () => {
    expect(readyToMerge("**Tier:** tiny\n**Ready to merge:** yes at 4d2a4fe\n", HEAD)).toEqual({ ready: true });
    expect(readyToMerge(`**Ready to merge:** Yes at ${HEAD.toUpperCase()}.`, HEAD)).toEqual({ ready: true });
  });

  it("holds the PR again after a push, until the builder names the new head", () => {
    expect(readyToMerge("**Ready to merge:** yes at cf65cb6", HEAD)).toEqual({
      ready: false,
      why: "**Ready to merge:** names cf65cb6, but the head is 4d2a4fe",
    });
  });

  it("holds a PR that says no, says nothing, has no body, or adds a condition", () => {
    expect(readyToMerge("**Ready to merge:** no, until the screenshots are in", HEAD)).toEqual({
      ready: false,
      why: '**Ready to merge:** says "no, until the screenshots are in", not "yes at <head sha>"',
    });
    expect(readyToMerge("**Tier:** tiny", HEAD)).toEqual({ ready: false, why: "no **Ready to merge:** line" });
    expect(readyToMerge(null, HEAD)).toEqual({ ready: false, why: "no **Ready to merge:** line" });
    expect(readyToMerge("**Ready to merge:** yes", HEAD)).toMatchObject({ ready: false });
    expect(readyToMerge("**Ready to merge:** yes at 4d2a4fe once Jasper checks the screenshots", HEAD)).toMatchObject({ ready: false });
    expect(readyToMerge("**Ready to merge:** yes at 4d2a", HEAD)).toMatchObject({ ready: false });
  });

  it("holds a PR whose yes is hidden or doubled, like the other fields", () => {
    expect(readyToMerge("```\n**Ready to merge:** yes at 4d2a4fe\n```", HEAD)).toMatchObject({ ready: false });
    expect(readyToMerge("<!-- **Ready to merge:** yes at 4d2a4fe -->", HEAD)).toMatchObject({ ready: false });
    expect(readyToMerge("**Ready to merge:** no\n**Ready to merge:** yes at 4d2a4fe", HEAD)).toEqual({
      ready: false,
      why: "2 lines start with **Ready to merge:**; keep one",
    });
  });
});

describe("pullsToMerge", () => {
  it("hands can-merge only the branch's PRs marked ready at their head, and says why it held the rest", () => {
    const answer = [
      pull(1, "claude/x"),
      pull(2, "claude/x", REPO, "**Ready to merge:** no"),
      pull(3, "claude/y"),
      pull(4, "claude/x", "someone/League-Web-App"),
    ];
    expect(pullsToMerge(answer, "claude/x", REPO)).toEqual({
      ready: [1],
      held: [{ number: 2, why: '**Ready to merge:** says "no", not "yes at <head sha>"' }],
    });
  });

  it("is the only way the script picks a PR, and it runs can-merge only on those", () => {
    const script = source("scripts/can-merge-action.ts");
    expect(script.match(/spawnSync\(/g)).toHaveLength(1);
    expect(script.match(/mergePull\(/g)).toHaveLength(1);
    // The one call that starts CI on main, so a no-op or another ref fails here.
    expect(script).toContain('startMainCi: () => execFileSync("gh", mainCiDispatchArgs(repository), { encoding: "utf8" }),');
    expect(script).toMatch(/const \{ ready, held \} = pullsToMerge\(pulls, target\.branch, repository\);/);
    expect(script).toMatch(/for \(const number of ready\) \{\n\s+const \{ failed: thisFailed \} = mergePull\(number, \{\n\s+runCanMerge: \(attempt\) => \{\n.*\n\s+const result = spawnSync\("npx", \["tsx", "scripts\/can-merge\.ts", String\(number\), "--merge"\]/);
  });
});

// One PR's run through can-merge, with GitHub faked: each can-merge try
// returns the next status in the list, and each "is it merged?" question the
// next answer in `merged` (false once they run out).
function fakeRun(statuses: (number | null)[], { merged = [] as boolean[], dispatchFails = false } = {}) {
  const calls: string[] = [];
  const summary: string[] = [];
  const log: string[] = [];
  let tries = 0;
  let asked = 0;
  const result = mergePull(240, {
    runCanMerge: (attempt): CanMergeRun => {
      calls.push(`can-merge try ${attempt}`);
      const status = statuses[tries++];
      return { status, why: `exit ${status}` };
    },
    isMerged: () => merged[asked++] ?? false,
    waitBeforeRetry: () => calls.push("wait"),
    startMainCi: () => {
      calls.push("start CI on main");
      // What execFileSync throws when gh exits non-zero.
      if (dispatchFails) {
        throw new Error(
          "Command failed: gh api -X POST repos/Jaspyplayz/League-Web-App/actions/workflows/ci.yml/dispatches -f ref=main\ngh: Resource not accessible by integration (HTTP 403)\n",
        );
      }
    },
    log: (line) => log.push(line),
    summary: (line) => summary.push(line),
  });
  return { ...result, calls, summary, log };
}

// GitHub doesn't start workflows for a push this job's token makes, so the
// merge would never run ci.yml on main (JAS-123). Starting it through
// workflow_dispatch is the one way the token can.
describe("mergePull starts CI on main after each merge", () => {
  it("asks GitHub to start ci.yml on main, with a JSON body", () => {
    expect(mainCiDispatchArgs(REPO)).toEqual([
      "api",
      "-X",
      "POST",
      "repos/Jaspyplayz/League-Web-App/actions/workflows/ci.yml/dispatches",
      "-f",
      "ref=main",
    ]);
  });

  it("starts it after can-merge merges the PR", () => {
    const run = fakeRun([0]);
    expect(run.calls).toEqual(["can-merge try 1", "start CI on main"]);
    expect(run.failed).toBe(false);
    expect(run.summary).toEqual(["#240: every gate passed and can-merge merged it.", "#240: started CI on main for the merge."]);
  });

  it("starts it after a crash that came after the merge, since main still changed", () => {
    const run = fakeRun([1], { merged: [true] });
    expect(run.calls).toEqual(["can-merge try 1", "start CI on main"]);
    expect(run.failed).toBe(true);
    expect(run.summary[0]).toBe("#240: merged, but a step after the merge failed (exit 1). The log above says which.");
  });

  it("starts it after a retry that merges", () => {
    expect(fakeRun([1, 0]).calls).toEqual(["can-merge try 1", "wait", "can-merge try 2", "start CI on main"]);
  });

  it("starts it when the retry is refused because the first try had merged after all", () => {
    // GitHub couldn't say the PR merged after the crash, so it retried, and
    // can-merge refused a PR that's no longer open.
    const run = fakeRun([1, REFUSED_EXIT_CODE], { merged: [false, true] });
    expect(run.calls).toEqual(["can-merge try 1", "wait", "can-merge try 2", "start CI on main"]);
    expect(run.failed).toBe(true);
    expect(run.summary[0]).toBe("#240: merged, but a step after the merge failed (exit 1). The log above says which.");
  });

  it("never starts it after a refusal", () => {
    const run = fakeRun([REFUSED_EXIT_CODE]);
    expect(run.calls).toEqual(["can-merge try 1"]);
    expect(run.failed).toBe(false);
    expect(run.log).toEqual(["::notice title=Not merged::#240: can-merge refused. See the gate lines in the log."]);
  });

  it("never starts it after a refusal that follows a crash, when the PR didn't merge", () => {
    const run = fakeRun([1, REFUSED_EXIT_CODE]);
    expect(run.calls).toEqual(["can-merge try 1", "wait", "can-merge try 2"]);
    expect(run.failed).toBe(false);
  });

  it("never starts it after crashes that didn't merge", () => {
    const run = fakeRun([1, null]);
    expect(run.calls).toEqual(["can-merge try 1", "wait", "can-merge try 2"]);
    expect(run.failed).toBe(true);
    expect(run.summary).toEqual(["#240: can-merge crashed (exit null) and wasn't merged. The log above says why."]);
  });

  it("fails the run when GitHub won't start it, and says the PR merged anyway", () => {
    const run = fakeRun([0], { dispatchFails: true });
    expect(run.failed).toBe(true);
    expect(run.summary).toEqual([
      "#240: every gate passed and can-merge merged it.",
      "#240: merged, but starting CI on main failed (gh: Resource not accessible by integration (HTTP 403)), so main's CI hasn't run on it. Start it from the Actions tab: CI, Run workflow, on main.",
    ]);
    expect(run.log).toEqual(["::error title=CI on main not started::#240 merged, but GitHub didn't start CI on main. The run's summary says what to do."]);
  });
});

describe("outcomeOf and shouldRetry", () => {
  it("tells a merge, a refusal and a crash apart", () => {
    expect(outcomeOf(0)).toBe("passed");
    expect(outcomeOf(REFUSED_EXIT_CODE)).toBe("refused");
    expect(outcomeOf(1)).toBe("crashed");
    expect(outcomeOf(null)).toBe("crashed");
  });

  it("never treats Node's uncaught-error code as a refusal", () => {
    expect(REFUSED_EXIT_CODE).not.toBe(1);
  });

  it("retries a crash before the merge once, and nothing else", () => {
    expect(ATTEMPTS).toBe(2);
    expect(shouldRetry("crashed", false, 1)).toBe(true);
    expect(shouldRetry("crashed", false, 2)).toBe(false);
    expect(shouldRetry("crashed", true, 1)).toBe(false);
    expect(shouldRetry("refused", false, 1)).toBe(false);
    expect(shouldRetry("passed", false, 1)).toBe(false);
  });
});

// The workflow reads can-merge's exit code, so a refusal must keep its own.
describe("scripts/can-merge.ts", () => {
  it("exits with REFUSED_EXIT_CODE when a gate fails, and 1 only for a usage error", () => {
    const code = source("scripts/can-merge.ts");
    expect(code.match(/process\.exit\([^)]*\)/g)).toEqual(["process.exit(1)", "process.exit(REFUSED_EXIT_CODE)"]);
    expect(code).toMatch(/if \(!decision\.ok\) \{\n.*can't merge.*\n\s+process\.exit\(REFUSED_EXIT_CODE\);/);
  });
});

// The workflow holds a write token, so it must never run a PR's code
// (JAS-121's fourth criterion). These pin every place the file could reach
// the PR or the token, so a change there has to change this test too.
describe(".github/workflows/agent-merge.yml", () => {
  const code = source(".github/workflows/agent-merge.yml")
    .split("\n")
    .filter((line) => line.trim() !== "" && !line.trim().startsWith("#"))
    .map((line) => line.replace(/\s+#.*$/, ""));

  it("runs only main's checkout, node, npm ci and the action script", () => {
    expect(code.filter((line) => /^\s*- (uses|run):/.test(line)).map((line) => line.trim())).toEqual([
      "- uses: actions/checkout@v7",
      "- uses: actions/setup-node@v7",
      "- run: npm ci",
      "- run: npx tsx scripts/can-merge-action.ts",
    ]);
    expect(code.filter((line) => /^\s*(ref|repository|path|token|cache|fetch-depth|persist-credentials|package-manager-cache):/.test(line)).map((line) => line.trim())).toEqual([
      "ref: main",
      "fetch-depth: 0",
      "persist-credentials: false",
      "package-manager-cache: false",
    ]);
  });

  it("reads the event and the token only in the job's if, its concurrency group and the last step", () => {
    expect(code.filter((line) => /github\b|\$\{\{/.test(line)).map((line) => line.trim())).toEqual([
      "github.event.workflow_run.conclusion == 'success' &&",
      "startsWith(github.event.workflow_run.head_branch, 'claude/') &&",
      "github.event.workflow_run.head_repository.full_name == github.repository",
      "group: agent-merge-${{ github.event.workflow_run.head_branch }}",
      "GH_TOKEN: ${{ github.token }}",
      "GH_REPO: ${{ github.repository }}",
    ]);
    expect(code.slice(-4).map((line) => line.trim())).toEqual([
      "- run: npx tsx scripts/can-merge-action.ts",
      "env:",
      "GH_TOKEN: ${{ github.token }}",
      "GH_REPO: ${{ github.repository }}",
    ]);
  });

  it("asks for write access only where merging needs it", () => {
    const start = code.findIndex((line) => line === "    permissions:");
    expect(code.slice(start + 1, start + 7).map((line) => line.trim())).toEqual([
      "contents: write",
      "pull-requests: write",
      "issues: write",
      "checks: read",
      "actions: write",
      "statuses: read",
    ]);
    expect(code).toContain("permissions: {}");
    expect(code.filter((line) => /permissions:/.test(line))).toHaveLength(2);
  });
});

// The Agent merge job starts this through workflow_dispatch after each merge
// (JAS-123). That trigger is the only change: its token still only reads, so
// the write access stays on the Agent merge job alone.
describe(".github/workflows/ci.yml", () => {
  const code = source(".github/workflows/ci.yml")
    .split("\n")
    .filter((line) => line.trim() !== "" && !line.trim().startsWith("#"))
    .map((line) => line.replace(/\s+#.*$/, ""));

  it("can be started through the API, and still runs on pushes to main and on PRs", () => {
    const on = code.indexOf("on:");
    const end = code.findIndex((line, i) => i > on && !line.startsWith(" "));
    expect(code.slice(on + 1, end).map((line) => line.trim())).toEqual(["push:", "branches: [main]", "pull_request:", "workflow_dispatch:"]);
  });

  it("fails at once when started by hand anywhere but main", () => {
    // A run started on a PR's branch would test it without main's newer
    // commits and become the PR's newest check, which can-merge reads.
    const steps = code.slice(code.indexOf("    steps:") + 1);
    expect(steps.slice(0, 4).map((line) => line.trim())).toEqual([
      "- if: github.event_name == 'workflow_dispatch' && github.ref != 'refs/heads/main'",
      "run: |",
      'echo "::error::Start CI by hand only on main. A PR\'s CI runs from its pull_request event."',
      "exit 1",
    ]);
  });

  it("asks only to read the repo", () => {
    expect(code.filter((line) => /permissions:|: (read|write)$/.test(line)).map((line) => line.trim())).toEqual([
      "permissions:",
      "contents: read",
    ]);
  });
});
