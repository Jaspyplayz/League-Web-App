import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { branchToTry, OpenPulls, openPullsPath, outcomeOf, WorkflowRunEvent } from "./can-merge-action-steps";
import { REFUSED_EXIT_CODE } from "./can-merge-gates";

const REPO = "Jaspyplayz/League-Web-App";

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

describe("openPullsPath", () => {
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

  it("reads the PR numbers from GitHub's answer", () => {
    expect(OpenPulls.parse([{ number: 237, title: "Header" }])).toEqual([{ number: 237 }]);
  });
});

describe("outcomeOf", () => {
  it("tells a merge, a refusal and a crash apart", () => {
    expect(outcomeOf(0)).toBe("passed");
    expect(outcomeOf(REFUSED_EXIT_CODE)).toBe("refused");
    expect(outcomeOf(1)).toBe("crashed");
    expect(outcomeOf(null)).toBe("crashed");
  });

  it("never treats Node's uncaught-error code as a refusal", () => {
    expect(REFUSED_EXIT_CODE).not.toBe(1);
  });
});

// The workflow holds a write token, so it must never run a PR's code
// (JAS-121's fourth criterion). These read the file itself.
describe(".github/workflows/agent-merge.yml", () => {
  const workflow = readFileSync(new URL("../.github/workflows/agent-merge.yml", import.meta.url), "utf8");
  const code = workflow
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");

  it("checks out main, and only main", () => {
    expect(code.match(/uses: actions\/checkout@/g)).toHaveLength(1);
    expect(code.match(/^\s*ref:.*$/gm)).toEqual(["          ref: main"]);
  });

  it("never names the PR's commit or branch outside the job's if and concurrency group", () => {
    const uses = code.split("\n").filter((line) => /workflow_run\.head_(sha|branch)/.test(line));
    expect(uses.map((line) => line.trim())).toEqual([
      "startsWith(github.event.workflow_run.head_branch, 'claude/') &&",
      "group: agent-merge-${{ github.event.workflow_run.head_branch }}",
    ]);
  });

  it("gives the token only to the can-merge step and doesn't keep it in git's config", () => {
    expect(code.match(/github\.token|secrets\./g)).toEqual(["github.token"]);
    expect(code).toContain("persist-credentials: false");
    expect(code).toMatch(/- run: npx tsx scripts\/can-merge-action\.ts\n\s+env:\n\s+GH_TOKEN:/);
  });
});
