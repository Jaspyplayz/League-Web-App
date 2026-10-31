import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ATTEMPTS,
  branchToTry,
  OpenPulls,
  openPullsPath,
  outcomeOf,
  pullsOnBranch,
  readyToMerge,
  shouldRetry,
  WorkflowRunEvent,
  type OpenPull,
} from "./can-merge-action-steps";
import { REFUSED_EXIT_CODE } from "./can-merge-gates";

const REPO = "Jaspyplayz/League-Web-App";

function source(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
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

function pull(number: number, ref: string, repo: string | null = REPO, body = "**Ready to merge:** yes"): OpenPull {
  return { number, body, head: { ref, repo: repo === null ? null : { full_name: repo } } };
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
    const answer = [{ number: 240, title: "Agent merge", body: null, head: { ref: "claude/x", sha: "abc", repo: { full_name: REPO } } }];
    expect(OpenPulls.parse(answer)).toEqual([{ number: 240, body: null, head: { ref: "claude/x", repo: { full_name: REPO } } }]);
  });

  it("keeps only the branch's PR in this repo, whatever GitHub answers", () => {
    const answer = [pull(1, "claude/x"), pull(2, "claude/y"), pull(3, "claude/x", "someone/League-Web-App"), pull(4, "claude/x", null)];
    expect(pullsOnBranch(answer, "claude/x", REPO).map(({ number }) => number)).toEqual([1]);
  });
});

describe("readyToMerge", () => {
  it("merges only once the builder writes yes", () => {
    expect(readyToMerge("**Tier:** tiny\n**Ready to merge:** yes\n")).toEqual({ ready: true });
    expect(readyToMerge("**Ready to merge:** Yes, steps 7 to 10 are done")).toEqual({ ready: true });
  });

  it("holds a PR that says no, says nothing, or has no body", () => {
    expect(readyToMerge("**Ready to merge:** no, until the screenshots are in")).toEqual({
      ready: false,
      why: '**Ready to merge:** says "no, until the screenshots are in", not yes',
    });
    expect(readyToMerge("**Tier:** tiny")).toEqual({ ready: false, why: "no **Ready to merge:** line" });
    expect(readyToMerge(null)).toEqual({ ready: false, why: "no **Ready to merge:** line" });
    expect(readyToMerge("**Ready to merge:** yesterday")).toMatchObject({ ready: false });
  });

  it("holds a PR whose yes is hidden or doubled, like the other fields", () => {
    expect(readyToMerge("```\n**Ready to merge:** yes\n```")).toMatchObject({ ready: false });
    expect(readyToMerge("<!-- **Ready to merge:** yes -->")).toMatchObject({ ready: false });
    expect(readyToMerge("**Ready to merge:** no\n**Ready to merge:** yes")).toEqual({
      ready: false,
      why: "2 lines start with **Ready to merge:**; keep one",
    });
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
      "actions: read",
      "statuses: read",
    ]);
    expect(code).toContain("permissions: {}");
    expect(code.filter((line) => /permissions:/.test(line))).toHaveLength(2);
  });
});
