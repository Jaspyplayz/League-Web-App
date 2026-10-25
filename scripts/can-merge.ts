// `npm run can-merge -- <pr> [--merge]`: may Claude Code merge its own PR?
// (issue #158, docs/workflow.md). The gates are in scripts/can-merge-gates.ts.
// This file reads what they check through git and gh, and does the merge.
//
//   npm run can-merge -- 170            print each gate, PASS or FAIL
//   npm run can-merge -- 170 --merge    the same, then merge if every gate passed
//
// It exits with an error when any gate fails, and then merges nothing.

import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { z } from "zod";
import {
  decide,
  MERGED_BY_CLAUDE,
  parseAgentMerge,
  parseReverts,
  SWITCH_FILE,
  toCheck,
  type AgentMerge,
  type Decision,
  type PrSnapshot,
  type RevertedPr,
} from "./can-merge-gates";

const USAGE = "Usage: npm run can-merge -- <pr number> [--merge]";

function run(command: string, args: string[]): string {
  return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

const PrView = z.object({
  number: z.number(),
  state: z.enum(["OPEN", "CLOSED", "MERGED"]),
  isDraft: z.boolean(),
  isCrossRepository: z.boolean(),
  baseRefName: z.string(),
  headRefName: z.string(),
  headRefOid: z.string(),
  author: z.object({ login: z.string(), is_bot: z.boolean() }),
  body: z.string(),
  changedFiles: z.number(),
  statusCheckRollup: z.array(
    z.discriminatedUnion("__typename", [
      z.object({
        __typename: z.literal("CheckRun"),
        name: z.string(),
        status: z.string(),
        conclusion: z.string().nullable(),
      }),
      z.object({ __typename: z.literal("StatusContext"), context: z.string(), state: z.string() }),
    ]),
  ),
});

const PrFile = z.object({ filename: z.string(), previous_filename: z.string().nullable() });

const CommitPulls = z.array(
  z.object({ number: z.number(), labels: z.array(z.object({ name: z.string() })) }),
);

function readPr(number: string): PrSnapshot {
  const view = PrView.parse(
    JSON.parse(run("gh", ["pr", "view", number, "--json", Object.keys(PrView.shape).join(",")])),
  );
  // gh pr view lists at most 100 files, so page through the REST list instead.
  const files = run("gh", [
    "api",
    `repos/{owner}/{repo}/pulls/${number}/files`,
    "--paginate",
    "--jq",
    ".[] | {filename, previous_filename}",
  ])
    .split("\n")
    .filter(Boolean)
    .map((line) => PrFile.parse(JSON.parse(line)));
  if (files.length !== view.changedFiles) {
    throw new Error(`GitHub listed ${files.length} of #${number}'s ${view.changedFiles} changed files`);
  }
  return {
    number: view.number,
    state: view.state,
    isDraft: view.isDraft,
    isCrossRepository: view.isCrossRepository,
    baseRefName: view.baseRefName,
    headRefName: view.headRefName,
    headRefOid: view.headRefOid,
    author: { login: view.author.login, isBot: view.author.is_bot },
    body: view.body,
    // A rename counts its old path too, so moving a file out of src/db/ is still risky.
    files: files.flatMap((file) => [file.filename, ...(file.previous_filename ? [file.previous_filename] : [])]),
    checks: view.statusCheckRollup.map(toCheck),
  };
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

function readReverts(since: string): RevertedPr[] {
  const log = run("git", [
    "log",
    "origin/main",
    "--fixed-strings",
    "--grep=This reverts commit",
    "--format=%H%x1f%cI%x1f%B%x1e",
  ]);
  return parseReverts(log, since).flatMap(({ sha, reverts }) =>
    reverts.flatMap((reverted) =>
      CommitPulls.parse(JSON.parse(run("gh", ["api", `repos/{owner}/{repo}/commits/${reverted}/pulls`]))).map(
        (pr) => ({ number: pr.number, labels: pr.labels.map((label) => label.name), revertCommit: sha }),
      ),
    ),
  );
}

function gateLines(decision: Decision): string[] {
  return decision.gates.map((gate) => `${gate.pass ? "PASS" : "FAIL"}  ${gate.name}: ${gate.detail}`);
}

// gh runs as Jasper, so GitHub shows him as the merger. The label marks the
// merge as Claude's, and the revert gate depends on it, so it goes on before
// the comment.
function merge(pr: PrSnapshot, decision: Decision) {
  const number = String(pr.number);
  console.log(`\nMerging #${number} at ${pr.headRefOid}`);
  run("gh", ["pr", "merge", number, "--merge", "--match-head-commit", pr.headRefOid]);
  try {
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
  } catch (error) {
    console.error(`#${number} merged, but labelling or commenting failed. Add ${MERGED_BY_CLAUDE} by hand.`);
    throw error;
  }
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
const agentMerge = readAgentMerge();
const reverts = agentMerge.on ? readReverts(agentMerge.since) : [];
const pr = readPr(positionals[0]);
const decision = decide(pr, agentMerge, reverts);

console.log(`#${pr.number} at ${pr.headRefOid}`);
for (const line of gateLines(decision)) console.log(line);
if (!decision.ok) {
  console.log(`\nClaude Code can't merge #${pr.number}.`);
  process.exit(1);
}
console.log(`\nEvery gate passed for #${pr.number}.`);
if (values.merge) merge(pr, decision);
