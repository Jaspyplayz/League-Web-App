// `npm run can-merge -- <pr> [--merge]`: may Claude Code merge its own PR?
// (issue #158, docs/workflow.md). The gates are in scripts/can-merge-gates.ts.
// This file reads what they check through git and gh, and does the merge.
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
import { changedPaths } from "./can-merge-files";
import {
  decide,
  MERGE_MARKER,
  MERGED_BY_CLAUDE,
  parseAgentMerge,
  parseReverts,
  SWITCH_FILE,
  toChecks,
  type AgentMerge,
  type ClaudeMerge,
  type Decision,
  type MainState,
  type PrSnapshot,
} from "./can-merge-gates";

const USAGE = "Usage: npm run can-merge -- <pr number> [--merge]";
const GATE_CODE = ["scripts/can-merge*", "scripts/risky-paths*", "package.json"];

function run(command: string, args: string[]): string {
  return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

// -z lists paths unquoted, so a name with unusual characters still matches.
function paths(output: string): string[] {
  return output.split("\0").filter(Boolean);
}

const PrView = z.object({
  number: z.number(),
  title: z.string(),
  state: z.enum(["OPEN", "CLOSED", "MERGED"]),
  isDraft: z.boolean(),
  isCrossRepository: z.boolean(),
  baseRefName: z.string(),
  baseRefOid: z.string(),
  headRefName: z.string(),
  headRefOid: z.string(),
  headRepositoryOwner: z.object({ login: z.string() }),
  author: z.object({ login: z.string(), is_bot: z.boolean() }),
  body: z.string(),
  statusCheckRollup: z.array(
    z.discriminatedUnion("__typename", [
      z.object({
        __typename: z.literal("CheckRun"),
        name: z.string(),
        workflowName: z.string(),
        status: z.string(),
        conclusion: z.string().nullable(),
        startedAt: z.iso.datetime().nullable(),
      }),
      z.object({
        __typename: z.literal("StatusContext"),
        context: z.string(),
        targetUrl: z.string().nullable(),
        state: z.string(),
      }),
    ]),
  ),
});

/** The PR as the gates see it, plus what the merge commit's message needs. */
type Pr = PrSnapshot & { title: string; headOwner: string };

function readPr(number: string): Pr {
  const view = PrView.parse(
    JSON.parse(run("gh", ["pr", "view", number, "--json", Object.keys(PrView.shape).join(",")])),
  );
  // The files come from the exact commit the checks ran on, so a push after
  // `gh pr view` can't swap in files nobody checked.
  run("git", ["fetch", "--quiet", "origin", `pull/${number}/head`]);
  const fetched = run("git", ["rev-parse", "FETCH_HEAD"]);
  if (fetched !== view.headRefOid) {
    throw new Error(`#${number} changed while checking (${view.headRefOid} became ${fetched}). Run can-merge again.`);
  }
  // GitHub's base commit also covers a merged PR, whose head is already in main.
  const files = [
    ...new Set([...changedPaths("origin/main", view.headRefOid), ...changedPaths(view.baseRefOid, view.headRefOid)]),
  ];
  return {
    number: view.number,
    title: view.title,
    state: view.state,
    isDraft: view.isDraft,
    isCrossRepository: view.isCrossRepository,
    baseRefName: view.baseRefName,
    headRefName: view.headRefName,
    headRefOid: view.headRefOid,
    headOwner: view.headRepositoryOwner.login,
    author: { login: view.author.login, isBot: view.author.is_bot },
    body: view.body,
    files,
    checks: toChecks(view.statusCheckRollup),
  };
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
  run("gh", [
    "pr",
    "merge",
    number,
    "--merge",
    "--match-head-commit",
    pr.headRefOid,
    "--subject",
    `Merge pull request #${number} from ${pr.headOwner}/${pr.headRefName}`,
    "--body",
    `${pr.title}\n\n${MERGE_MARKER}`,
  ]);
  const mergeCommit = run("gh", ["pr", "view", number, "--json", "mergeCommit", "--jq", ".mergeCommit.oid"]);
  const message = run("gh", ["api", `repos/{owner}/{repo}/commits/${mergeCommit}`, "--jq", ".commit.message"]);
  if (!message.includes(MERGE_MARKER)) {
    throw new Error(`Merge commit ${mergeCommit} is missing "${MERGE_MARKER}", so the revert gate can't see it.`);
  }
  console.log(`Merge commit ${mergeCommit} carries the marker`);

  const labels = run("gh", ["label", "list", "--search", MERGED_BY_CLAUDE, "--json", "name", "--jq", ".[].name"]);
  if (!labels.split("\n").includes(MERGED_BY_CLAUDE)) {
    console.log(`Creating the ${MERGED_BY_CLAUDE} label`);
    run("gh", [
      "label",
      "create",
      MERGED_BY_CLAUDE,
      "--description",
      "Claude Code merged this with npm run can-merge",
      "--color",
      "5319E7",
    ]);
  }
  console.log(`Adding the ${MERGED_BY_CLAUDE} label`);
  run("gh", ["pr", "edit", number, "--add-label", MERGED_BY_CLAUDE]);
  console.log("Commenting with the gates");
  const comment = [
    `Claude Code merged this at ${pr.headRefOid} with \`npm run can-merge -- ${number} --merge\`.`,
    "",
    ...gateLines(decision).map((line) => `- ${line}`),
  ].join("\n");
  run("gh", ["pr", "comment", number, "--body", comment]);
  console.log(`Merged #${number}.`);
}

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
const pr = readPr(positionals[0]);
const decision = decide(pr, main);

console.log(`#${pr.number} at ${pr.headRefOid}`);
for (const line of gateLines(decision)) console.log(line);
if (!decision.ok) {
  console.log(`\nClaude Code can't merge #${pr.number}.`);
  process.exit(1);
}
console.log(`\nEvery gate passed for #${pr.number}.`);
if (values.merge) merge(pr, decision);
