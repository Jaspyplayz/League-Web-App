import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AgentMergeEvent,
  ATTEMPTS,
  branchToTry,
  hasMergeConflict,
  mainCiDispatchArgs,
  mergePull,
  OpenPulls,
  openPullsPath,
  outcomeOf,
  pullsOnBranch,
  pullsToMerge,
  readyToMerge,
  shouldRetry,
  whatStartedRun,
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

// A workflow's lines without blank lines or comments, so a test pins what runs.
function workflowLines(path: string): string[] {
  return source(path)
    .split("\n")
    .filter((line) => line.trim() !== "" && !line.trim().startsWith("#"))
    .map((line) => line.replace(/\s+#.*$/, ""));
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

// What GitHub sends when the sweep or a person starts a run by name.
function startedByName(branch: string): AgentMergeEvent {
  return AgentMergeEvent.parse({
    inputs: { branch },
    // GitHub sends many more fields here too; the schema keeps only inputs.
    ref: "refs/heads/main",
  });
}

function pull(number: number, ref: string, repo: string | null = REPO, body = "**Ready to merge:** yes at 4d2a4fe"): OpenPull {
  return { number, body, head: { ref, sha: HEAD, repo: repo === null ? null : { full_name: repo } } };
}

describe("AgentMergeEvent", () => {
  it("reads both ways a run can start", () => {
    expect("workflow_run" in AgentMergeEvent.parse(event("claude/x"))).toBe(true);
    expect("inputs" in startedByName("claude/x")).toBe(true);
  });

  it("refuses anything else, so a run can't go on without knowing its branch", () => {
    expect(() => AgentMergeEvent.parse({ schedule: "7 * * * *" })).toThrow();
    expect(() => AgentMergeEvent.parse({ inputs: {} })).toThrow();
  });
});

describe("whatStartedRun", () => {
  it("names the workflow that finished, or says another try was asked for", () => {
    expect(whatStartedRun(event("claude/x"))).toBe("CI finished");
    expect(whatStartedRun(startedByName("claude/x"))).toBe("Another try was asked for");
  });
});

describe("branchToTry", () => {
  it("tries a Claude branch named by the sweep or a person", () => {
    expect(branchToTry(startedByName("claude/jas-164-x"), REPO)).toEqual({ branch: "claude/jas-164-x" });
  });

  it("skips any other branch named that way", () => {
    for (const branch of ["main", "jaspyplayz/jas-121-thing", "dependabot/npm_and_yarn/next-16.1.0"]) {
      expect(branchToTry(startedByName(branch), REPO)).toEqual({ skip: `${branch} doesn't start with claude/` });
    }
  });

  it("leaves a named branch's repo to pullsOnBranch, which drops a fork's PR of the same name", () => {
    const { ready, held } = pullsToMerge([pull(5, "claude/x", "someone/League-Web-App")], "claude/x", REPO);
    expect(ready).toEqual([]);
    expect(held).toEqual([]);
  });

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
    // A run started by name carries a different event. With the narrower
    // WorkflowRunEvent here, types and tests would still pass, and every run
    // the sweep starts would crash on this line.
    expect(script).toContain('const event = AgentMergeEvent.parse(JSON.parse(readFileSync(eventPath, "utf8")));');
    // The real conflict check, so a no-op here can't pass for the notice.
    expect(script).toContain("return hasMergeConflict(api(`repos/${repository}/pulls/${number}`) as { mergeable?: unknown });");
    expect(script).toContain("hasConflict: () => hasConflict(number),");
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
function fakeRun(statuses: (number | null)[], { merged = [] as boolean[], dispatchFails = false, conflict = false } = {}) {
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
    hasConflict: () => conflict,
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

describe("hasMergeConflict", () => {
  it("is true only when GitHub says the PR can't merge", () => {
    expect(hasMergeConflict({ mergeable: false })).toBe(true);
    expect(hasMergeConflict({ mergeable: true })).toBe(false);
  });

  it("isn't a conflict while GitHub is still working it out, so can-merge goes ahead", () => {
    expect(hasMergeConflict({ mergeable: null })).toBe(false);
    expect(hasMergeConflict({})).toBe(false);
  });
});

describe("mergePull with a merge conflict", () => {
  it("leaves a notice and passes, without running can-merge, so the sweep can't turn runs red every 15 minutes", () => {
    const { failed, calls, summary, log } = fakeRun([1, 1], { conflict: true });
    expect(failed).toBe(false);
    expect(calls).toEqual([]);
    expect(summary.join("\n")).toContain("#240: not merged, since it has a merge conflict");
    expect(log.join("\n")).toContain("::notice title=Not merged::#240 has a merge conflict.");
  });
});

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
  const code = workflowLines(".github/workflows/agent-merge.yml");

  it("starts when a check finishes, or by name", () => {
    const on = code.indexOf("on:");
    const end = code.findIndex((line, i) => i > on && !line.startsWith(" "));
    expect(code.slice(on + 1, end).map((line) => line.trim())).toEqual([
      "workflow_run:",
      "workflows: [CI, Reviewer, Smoke test, Dependency review]",
      "types: [completed]",
      "workflow_dispatch:",
      "inputs:",
      "branch:",
      "description: The claude/ branch whose PR to try",
      "required: true",
      "type: string",
    ]);
  });

  it("never lets a new run cancel a running one", () => {
    expect(code.map((line) => line.trim())).toContain("cancel-in-progress: false");
  });

  it("gives up on a hung run in minutes, so it can't hold its branch's queue for hours", () => {
    expect(code.map((line) => line.trim())).toContain("timeout-minutes: 10");
  });

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

  // The ref line matters: a run on a PR's branch lands on that PR's head, where
  // the gates read checks (docs/agent-mistakes/new-trigger-feeds-the-gates.md).
  // With this line, an unedited copy started there only shows as skipped.
  it("reads the event and the token only in the run's name, the job's if, its concurrency group and the last step", () => {
    expect(code.filter((line) => /github\b|inputs\.|\$\{\{/.test(line)).map((line) => line.trim())).toEqual([
      "run-name: Agent merge ${{ github.event.workflow_run.head_branch || inputs.branch }}",
      "(github.event_name == 'workflow_dispatch' &&",
      "github.ref == 'refs/heads/main' &&",
      "startsWith(inputs.branch, 'claude/')) ||",
      "(github.event.workflow_run.conclusion == 'success' &&",
      "startsWith(github.event.workflow_run.head_branch, 'claude/') &&",
      "github.event.workflow_run.head_repository.full_name == github.repository)",
      "group: agent-merge-${{ github.event.workflow_run.head_branch || inputs.branch }}",
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

// The sweep only starts Agent merge again for a PR still marked ready
// (JAS-164). can-merge still decides, in the run it starts, so the sweep must
// have no way to merge anything itself.
describe(".github/workflows/agent-merge-sweep.yml", () => {
  const code = workflowLines(".github/workflows/agent-merge-sweep.yml");
  const text = code.join("\n");

  it("runs on its schedule alone", () => {
    const on = code.indexOf("on:");
    const end = code.findIndex((line, i) => i > on && !line.startsWith(" "));
    expect(code.slice(on + 1, end).map((line) => line.trim())).toEqual(["schedule:", '- cron: "7,22,37,52 * * * *"']);
  });

  it("can list PRs and start runs, but can't push or merge", () => {
    expect(code.filter((line) => /permissions:|: (read|write)$/.test(line)).map((line) => line.trim())).toEqual([
      "permissions: {}",
      "permissions:",
      "pull-requests: read",
      "actions: write",
    ]);
  });

  it("runs none of the repo's code", () => {
    expect(code.filter((line) => /uses:|\bnpm\b|\bnpx\b|\bgit\b|can-merge/.test(line))).toEqual([]);
    expect(text).not.toMatch(/gh pr merge|-X\s/);
  });

  it("tries every ready PR even if one start fails, and still ends red", () => {
    expect(text).toContain('gh workflow run agent-merge.yml --ref main -f branch="$branch" || failed=1');
    expect(code.map((line) => line.trim())).toContain('exit "$failed"');
  });

  it("starts Agent merge on main, naming only Claude's branches in this repo", () => {
    expect(text).toContain('select(.head.ref | startswith("claude/"))');
    expect(text).toContain("select(.head.repo.full_name == env.GH_REPO)");
    expect(text).toContain("--ref main");
  });

  it("stops trying a PR nobody has touched for a day, and gives up on a hung sweep", () => {
    expect(text).toContain("select(.updated_at > (now - 86400 | todate))");
    expect(code.map((line) => line.trim())).toContain("timeout-minutes: 5");
  });

  it("never misses a PR readyToMerge would pass, and skips one saying no or naming an old head", () => {
    // The workflow's filter, in JS: the same pattern, then the same check that
    // the commit it names starts the head's SHA. The pattern has no
    // backslashes, so it reads the same here, in jq and through any shell. jq
    // can't run here, so these two lines pin everything around the pattern: the
    // head it compares with, the lowercasing, and the comparison this copies.
    const filter = text.replace(/\s+/g, " ");
    expect(filter).toContain('select(.head.sha as $head | (.body // "") | [match(');
    expect(filter).toContain('"gi").captures[0].string | ascii_downcase] | any(. as $named | $head | startswith($named)))');
    const written = text.match(/match\("(.+)"; "gi"\)/)?.[1];
    expect(written).toBeDefined();
    expect(written).not.toContain("\\");
    const picks = (body: string) => [...body.matchAll(new RegExp(written as string, "gi"))].some((match) => HEAD.startsWith(match[1].toLowerCase()));

    const ready = [
      "**Ready to merge:** yes at 4d2a4fe",
      "**Ready to merge:** yes at 4d2a4fe.",
      "**Ready to merge:**   YES AT 4D2A4FE",
      "**Ready to merge:**\tyes at 4d2a4fe",
      "**Ready to merge:** yes at 4d2a4fe",
      `  **Ready to merge:** yes at ${HEAD}`,
      "**Tier:** tiny\n\n**Ready to merge:** yes at 4d2a4fe\n\nThe rest.",
    ];
    for (const body of ready) {
      expect(readyToMerge(body, HEAD)).toEqual({ ready: true });
      expect(picks(body)).toBe(true);
    }

    const held = [
      "**Ready to merge:** no",
      "**Ready to merge:** no: Jasper merges this one by hand.",
      "**Ready to merge:** no. As its last step the builder changes this to `yes at <head sha>`",
      "**Ready to merge:** yes at 1111111",
      "No such line.",
    ];
    for (const body of held) {
      expect(readyToMerge(body, HEAD).ready).toBe(false);
      expect(picks(body)).toBe(false);
    }
  });
});

// The Agent merge job starts this through workflow_dispatch after each merge
// (JAS-123). That trigger is the only change: its token still only reads, so
// the power to push and merge stays on the Agent merge job alone.
describe(".github/workflows/ci.yml", () => {
  const code = workflowLines(".github/workflows/ci.yml");

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
