// `npm run can-merge -- <pr> [--merge]`: may Claude Code merge its own PR?
// (issue #158, docs/workflow.md). The gates are in scripts/can-merge-gates.ts.
// This file reads what they check through git and GitHub's REST API, and does
// the merge. It calls GitHub only with `gh api`, never `gh pr`, because a cloud
// session's GitHub proxy refuses the GraphQL API that `gh pr` uses (JAS-26).
// Run it from an up-to-date main checkout, since it refuses when its own code
// differs from origin/main's.
//
//   npm run can-merge -- 170            print each gate, PASS or FAIL
//   npm run can-merge -- 170 --merge    the same, then merge if every gate passed
//
// It exits with an error when any gate fails, and then merges nothing.

import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { z } from "zod";
import { changedLines, changedPaths, reviewHistory } from "./can-merge-files";
import {
  decide,
  MERGE_MARKER,
  MERGED_BY_CLAUDE,
  parseAgentMerge,
  parseReverts,
  SWITCH_FILE,
  type AgentMerge,
  type ClaudeMerge,
  type Decision,
  type MainState,
  type ReviewHistory,
} from "./can-merge-gates";
import {
  CheckRunPage,
  mergeRequest,
  Pull,
  StatusPage,
  toPrSnapshot,
  WorkflowRunPage,
  type Pr,
} from "./can-merge-rest";

const USAGE = "Usage: npm run can-merge -- <pr number> [--merge]";
const GATE_CODE = ["scripts/can-merge*", "scripts/risky-paths*", "package.json"];

function run(command: string, args: string[], input?: string): string {
  const stdin = input === undefined ? "ignore" : "pipe";
  return execFileSync(command, args, { encoding: "utf8", input, stdio: [stdin, "pipe", "pipe"] }).trim();
}

// -z lists paths unquoted, so a name with unusual characters still matches.
function paths(output: string): string[] {
  return output.split("\0").filter(Boolean);
}

// gh fills in {owner}/{repo} from this checkout's GitHub remote.
function api(path: string): unknown {
  return JSON.parse(run("gh", ["api", path]));
}

// The body goes in as JSON on stdin, so a PR title or comment never passes
// through gh's own field parsing.
function send(method: "PUT" | "POST", path: string, body: object): unknown {
  return JSON.parse(run("gh", ["api", "--method", method, path, "--input", "-"], JSON.stringify(body)));
}

// can-merge reads one page of up to 100 items from each list; #195 had 12
// check runs. A longer list stops the run rather than leaving checks unread.
function wholeList<T>(what: string, total: number, items: T[]): T[] {
  if (items.length < total) {
    throw new Error(`GitHub has ${total} ${what} for this commit, but can-merge reads only the first 100.`);
  }
  return items;
}

function readPr(number: string): { pr: Pr; history: ReviewHistory } {
  const pull = Pull.parse(api(`repos/{owner}/{repo}/pulls/${number}`));
  const sha = pull.head.sha;
  // The files come from the exact commit the checks ran on, so a push after
  // reading the PR can't swap in files nobody checked.
  run("git", ["fetch", "--quiet", "origin", `pull/${number}/head`]);
  const fetched = run("git", ["rev-parse", "FETCH_HEAD"]);
  if (fetched !== sha) {
    throw new Error(`#${number} changed while checking (${sha} became ${fetched}). Run can-merge again.`);
  }
  // GitHub's base commit also covers a merged PR, whose head is already in main.
  const files = [...new Set([...changedPaths("origin/main", sha), ...changedPaths(pull.base.sha, sha)])];
  // Every run of every check, not only GitHub's latest of each name, since
  // toChecks picks the latest of each workflow and name itself.
  const runs = CheckRunPage.parse(api(`repos/{owner}/{repo}/commits/${sha}/check-runs?filter=all&per_page=100`));
  const workflows = WorkflowRunPage.parse(api(`repos/{owner}/{repo}/actions/runs?head_sha=${sha}&per_page=100`));
  const status = StatusPage.parse(api(`repos/{owner}/{repo}/commits/${sha}/status?per_page=100`));
  const pr = toPrSnapshot(
    {
      pull,
      checkRuns: wholeList("check runs", runs.total_count, runs.check_runs),
      workflowRuns: wholeList("workflow runs", workflows.total_count, workflows.workflow_runs),
      statuses: wholeList("commit statuses", status.total_count, status.statuses),
    },
    files,
  );
  // Like the files, the lines take the larger count against main or GitHub's
  // base, and a verdict on a commit either one has doesn't count.
  const history = reviewHistory(pull.base.sha, sha, undefined, ["origin/main"]);
  for (const [path, change] of Object.entries(changedLines([`origin/main...${sha}`]))) {
    const known = history.lines[path];
    if (!known || change.added + change.deleted > known.added + known.deleted) history.lines[path] = change;
  }
  return { pr, history };
}

function readMain(): MainState {
  // Working copy against main, so uncommitted edits count too.
  const changedGateCode = paths(run("git", ["diff", "--name-only", "-z", "origin/main", "--", ...GATE_CODE]));
  const agentMerge = readAgentMerge();
  if (!agentMerge.on) return { agentMerge, changedGateCode, reverts: [], claudeMerges: [] };
  const revertLog = run("git", [
    "log",
    "origin/main",
    "--fixed-strings",
    "--grep=This reverts commit",
    "--format=%H%x1f%cI%x1f%B%x1e",
  ]);
  const reverts = parseReverts(revertLog, agentMerge.since);
  return { agentMerge, changedGateCode, reverts, claudeMerges: readClaudeMerges() };
}

// Read from main, not this folder, so only a PR Jasper merges can change it.
function readAgentMerge(): AgentMerge {
  let text: string;
  try {
    text = run("git", ["show", `origin/main:${SWITCH_FILE}`]);
  } catch {
    return { on: false, why: `no ${SWITCH_FILE} on origin/main` };
  }
  return parseAgentMerge(text, new Date().toISOString().slice(0, 10));
}

// Every merge commit on main with the marker, with the merge itself and each
// commit it brought in, so reverting any one of them counts.
function readClaudeMerges(): ClaudeMerge[] {
  const log = run("git", [
    "log",
    "origin/main",
    "--merges",
    "--fixed-strings",
    `--grep=${MERGE_MARKER}`,
    "--format=%H %P%x1f%s",
  ]);
  return log
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [shas, subject] = line.split("\x1f");
      const [merge, base, head] = shas.split(" ");
      const brought = run("git", ["rev-list", `${base}..${head}`]).split("\n").filter(Boolean);
      return { subject, commits: [merge, ...brought] };
    });
}

function gateLines(decision: Decision): string[] {
  return decision.gates.map((gate) => `${gate.pass ? "PASS" : "FAIL"}  ${gate.name}: ${gate.detail}`);
}

// gh runs as Jasper, so GitHub shows him as the merger. The marker in the
// merge commit is the record the revert gate reads; the label and comment are
// for people reading the PR on GitHub.
function merge(pr: Pr, decision: Decision) {
  const number = String(pr.number);
  console.log(`\nMerging #${number} at ${pr.headRefOid}`);
  const request = mergeRequest(pr);
  const { sha: mergeCommit } = MergeResult.parse(send("PUT", request.path, request.body));
  console.log(`Merged #${number}: merge commit ${mergeCommit}`);

  // The PR is merged now, and nothing below can undo that. So each step that
  // fails says so and the rest still run; the run then ends with an error
  // naming what failed.
  const unfinished: string[] = [];
  const step = (what: string, action: () => void) => {
    try {
      action();
    } catch (error) {
      unfinished.push(what);
      console.error(`Couldn't ${what}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  step("check the merge commit's marker", () => {
    const message = run("gh", ["api", `repos/{owner}/{repo}/commits/${mergeCommit}`, "--jq", ".commit.message"]);
    if (!message.includes(MERGE_MARKER)) throw new Error(`"${MERGE_MARKER}" is missing, so the revert gate can't see it`);
    console.log("The merge commit carries the marker");
  });
  step("comment with the gates", () => {
    const comment = [
      `Claude Code merged this at ${pr.headRefOid} with \`npm run can-merge -- ${number} --merge\`.`,
      "",
      ...gateLines(decision).map((line) => `- ${line}`),
    ].join("\n");
    send("POST", `repos/{owner}/{repo}/issues/${number}/comments`, { body: comment });
    console.log("Commented with the gates");
  });
  // can-merge never creates the label, so a typo or a deleted label can't make
  // a new one. Jasper creates it once; the marker is the record that counts.
  step(`add the ${MERGED_BY_CLAUDE} label`, () => {
    const labels = run("gh", ["api", "--paginate", "repos/{owner}/{repo}/labels", "--jq", ".[].name"]).split("\n");
    if (!labels.includes(MERGED_BY_CLAUDE)) {
      console.log(`Skipped the ${MERGED_BY_CLAUDE} label, which doesn't exist on GitHub yet`);
      return;
    }
    send("POST", `repos/{owner}/{repo}/issues/${number}/labels`, { labels: [MERGED_BY_CLAUDE] });
    console.log(`Added the ${MERGED_BY_CLAUDE} label`);
  });
  if (unfinished.length > 0) {
    throw new Error(
      `#${number} is merged, but these steps failed (errors above): ${unfinished.join("; ")}. Tell Jasper. ` +
        "A comment or label can be added by hand; a merge commit missing the marker can only be reverted.",
    );
  }
}

// GitHub answers a merge with the merge commit's sha, or an error if it refused.
const MergeResult = z.object({ merged: z.literal(true), sha: z.string() });

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { merge: { type: "boolean", default: false } },
});
if (positionals.length !== 1 || !/^\d+$/.test(positionals[0])) {
  console.error(USAGE);
  process.exit(1);
}

run("git", ["fetch", "--quiet", "origin", "main"]);
const main = readMain();
const { pr, history } = readPr(positionals[0]);
const decision = decide(pr, main, history);

console.log(`#${pr.number} at ${pr.headRefOid}`);
for (const line of gateLines(decision)) console.log(line);
if (!decision.ok) {
  console.log(`\nClaude Code can't merge #${pr.number}.`);
  process.exit(1);
}
console.log(`\nEvery gate passed for #${pr.number}.`);
if (values.merge) merge(pr, decision);
