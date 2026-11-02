import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MERGE_MARKER, MERGED_BY_CLAUDE, REFUSED_EXIT_CODE } from "./can-merge-gates";

const SCRIPT = resolve("scripts/can-merge.ts");
const TSX = resolve("node_modules/tsx/dist/cli.mjs");
// The tsconfig the Agent merge workflow gives tsx.
const TSCONFIG = resolve("scripts/can-merge.tsconfig.json");
const MERGE_COMMIT = "0123456789abcdef0123456789abcdef01234567";

// can-merge reaches GitHub only through execFileSync("gh", ...). This file is
// loaded into the script's own Node process before the script. It answers
// those calls from a JSON file of GitHub's REST answers and logs each one,
// while git runs for real. A fake gh program on PATH would only work on Linux
// and macOS, since on Windows Node without a shell only runs .exe and .com
// files, and Jasper runs the tests there.
const FAKE_GH = `
const childProcess = require("node:child_process");
const fs = require("node:fs");
const realExecFileSync = childProcess.execFileSync;
childProcess.execFileSync = (command, args, options) => {
  if (command !== "gh") return realExecFileSync(command, args, options);
  fs.appendFileSync(process.env.FAKE_GH_LOG, JSON.stringify({ args, input: options.input }) + "\\n");
  const path = args.find((arg) => arg.startsWith("repos/"));
  const answers = JSON.parse(fs.readFileSync(process.env.FAKE_GH_ANSWERS, "utf8"));
  if (!(path in answers)) throw new Error("fake gh has no answer for " + path);
  return typeof answers[path] === "string" ? answers[path] : JSON.stringify(answers[path]);
};
// So a script that tsx runs as an ES module sees the fake too.
require("node:module").syncBuiltinESMExports();
`;

type Pr = { number: number; branch: string; head: string; base: string; body: string };

// The gates have tests of their own, but this script, which reads what they
// judge and then merges, didn't run in any (JAS-260). So this runs the real
// script, the way can-merge-reviewer-check.test.ts runs its own.
describe("npm run can-merge, on real git with GitHub faked", { timeout: 60_000 }, () => {
  const root = mkdtempSync(join(tmpdir(), "can-merge-"));
  // GitHub's copy of the repo, with a refs/pull/<n>/head ref for each PR as
  // GitHub has. The script runs in a clone of it, as from a main checkout.
  const origin = join(root, "origin");
  const checkout = join(root, "checkout");
  // Another clone, with an uncommitted edit to the gates.
  const edited = join(root, "edited");
  const fakeGh = join(root, "fake-gh.cjs");
  const answersFile = join(root, "answers.json");
  const logFile = join(root, "gh-calls.log");

  // autocrlf is on in Git for Windows' setup, so it's off here to keep the
  // test's own commits the same bytes on every computer.
  const git = (cwd: string, ...args: string[]) =>
    execFileSync(
      "git",
      ["-c", "user.name=test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", "-c", "core.autocrlf=false", ...args],
      { cwd, encoding: "utf8" },
    ).trim();
  // Writes each file, or deletes it for null, and commits on origin's branch.
  const commit = (message: string, files: Record<string, string | null>) => {
    for (const [path, text] of Object.entries(files)) {
      const file = join(origin, path);
      if (text === null) {
        rmSync(file);
      } else {
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, text);
      }
    }
    git(origin, "add", "-A");
    git(origin, "commit", "-q", "-m", message);
    return git(origin, "rev-parse", "HEAD");
  };
  const shas = { first: "", main: "", reviewed: "", pushedLater: "", mergeReverted: "", commitReverted: "", switchedOff: "" };
  let habits: Pr, migration: Pr, moved: Pr, pushed: Pr, mergedMain: Pr;

  // A description every gate that reads one passes: the reviewer's verdict on
  // `verdictAt` and, for a PR with risky paths, the panel's line too.
  const body = (verdictAt: string, panel = false) =>
    [
      "**Tier:** normal: a habit card.",
      "**Builder:** Claude Code on Opus 5.5.",
      "**Door:** two-way: a revert undoes all of it.",
      "",
      "## Acceptance criteria",
      "",
      "- [x] Habits show on Insights",
      "",
      "## Review",
      "",
      `Reviewer agent at ${verdictAt}: no blockers`,
      ...(panel ? ["", `Interrogate panel at ${verdictAt}: 0 to act on`] : []),
      "",
    ].join("\n");

  // A branch from `from` with one commit per entry, and GitHub's ref to it.
  const openPr = (number: number, branch: string, from: string, commits: Record<string, string | null>[], panel = false): Pr => {
    git(origin, "switch", "-q", "-c", branch, from);
    let head = from;
    for (const files of commits) head = commit(branch, files);
    git(origin, "update-ref", `refs/pull/${number}/head`, head);
    return { number, branch, head, base: shas.main, body: body(head, panel) };
  };

  beforeAll(() => {
    writeFileSync(fakeGh, FAKE_GH);
    mkdirSync(origin);
    git(origin, "init", "-q", "-b", "main");
    // Merging is on since a date before any commit here, so every revert counts.
    shas.first = commit("first", {
      "README.md": "# Turnpoint\n",
      ".claude/agent-merge.json": '{ "enabledSince": "2020-01-01" }\n',
      "scripts/can-merge-gates.ts": "export const gates = [];\n",
      "src/db/schema.ts": "export const players = {};\n",
    });
    shas.main = commit("main moves on", { "docs/later.md": "Later.\n" });

    habits = openPr(1, "claude/jas-1-habits", shas.main, [{ "src/lib/habits.ts": "export const habits = 1;\n" }]);
    migration = openPr(2, "claude/jas-2-habits-table", shas.main, [{ "drizzle/0042_habits.sql": "CREATE TABLE habits ();\n" }], true);
    // Without rename detection, git lists the old path too.
    const move = { "src/db/schema.ts": null, "src/lib/schema.ts": "export const players = {};\n" };
    moved = openPr(3, "claude/jas-3-move-schema", shas.main, [move], true);
    // GitHub's answer names the first commit, but by the time the script
    // fetches the PR, a second one that adds a migration is on top.
    const later = openPr(4, "claude/jas-4-streaks", shas.main, [
      { "src/lib/streaks.ts": "export const streak = 0;\n" },
      { "drizzle/0043_streaks.sql": "CREATE TABLE streaks ();\n" },
    ]);
    shas.pushedLater = later.head;
    const checked = git(origin, "rev-parse", `${later.head}~1`);
    pushed = { ...later, head: checked, body: body(checked) };

    // Reviewed, then main merged in. GitHub's base commit can be older than
    // origin/main, as it is here.
    git(origin, "switch", "-q", "-c", "claude/jas-5-streak-card", shas.first);
    shas.reviewed = commit("streak card", { "src/lib/streak-card.ts": "export const card = 1;\n" });
    git(origin, "merge", "-q", "--no-ff", "--no-edit", shas.main);
    const merged = git(origin, "rev-parse", "HEAD");
    git(origin, "update-ref", "refs/pull/5/head", merged);
    mergedMain = { number: 5, branch: "claude/jas-5-streak-card", head: merged, base: shas.first, body: body(shas.reviewed) };

    // Main after can-merge merged #9 and someone reverted it, with git's own
    // message, or reverted one commit it brought in.
    git(origin, "switch", "-q", "-c", "claude/jas-9-streaks", shas.main);
    const brought = commit("streaks", { "src/lib/streaks.ts": "export const streak = 0;\n" });
    commit("streak page", { "src/app/streaks.tsx": "export default function Streaks() {}\n" });
    git(origin, "switch", "-q", "main");
    const subject = "Merge pull request #9 from Jaspyplayz/claude/jas-9-streaks";
    git(origin, "merge", "-q", "--no-ff", "-m", subject, "-m", `Add streaks\n\n${MERGE_MARKER}`, "claude/jas-9-streaks");
    const claudeMerge = git(origin, "rev-parse", "HEAD");
    git(origin, "revert", "--no-edit", "-m", "1", claudeMerge);
    shas.mergeReverted = git(origin, "rev-parse", "HEAD");
    git(origin, "reset", "-q", "--hard", claudeMerge);
    git(origin, "revert", "--no-edit", brought);
    shas.commitReverted = git(origin, "rev-parse", "HEAD");

    git(origin, "reset", "-q", "--hard", shas.main);
    shas.switchedOff = commit("merging off", { ".claude/agent-merge.json": '{ "enabledSince": null }\n' });

    // Each run points main where it needs it, so nothing has main checked out.
    git(origin, "switch", "-q", "--detach");
    git(origin, "update-ref", "refs/heads/main", shas.main);
    git(root, "clone", "-q", "--branch", "main", origin, checkout);
    git(root, "clone", "-q", "--branch", "main", origin, edited);
    writeFileSync(join(edited, "scripts/can-merge-gates.ts"), "export const gates = []; // every gate removed\n");
  }, 60_000);
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  // GitHub's answers about one PR, with CI, the smoke test and Vercel passed
  // at its head. `checkRuns` is how many check runs GitHub says there are;
  // one page lists at most 100 of them.
  const answers = (pr: Pr, checkRuns: number) => {
    const repo = "repos/{owner}/{repo}";
    const run = (name: string, suite: number) => ({
      name,
      status: "completed",
      conclusion: "success",
      started_at: "2026-11-02T10:00:00Z",
      check_suite: { id: suite },
    });
    const others = Array.from({ length: checkRuns - 2 }, (_, i) => run(`other ${i + 1}`, 3));
    return {
      [`${repo}/pulls/${pr.number}`]: {
        number: pr.number,
        title: "Add habits",
        state: "open",
        draft: false,
        merged: false,
        user: { login: "Jaspyplayz", type: "User" },
        body: pr.body,
        head: { ref: pr.branch, sha: pr.head, user: { login: "Jaspyplayz" }, repo: { id: 1 } },
        base: { ref: "main", sha: pr.base, repo: { id: 1 } },
      },
      [`${repo}/commits/${pr.head}/check-runs?filter=all&per_page=100`]: {
        total_count: checkRuns,
        check_runs: [run("check", 1), run("smoke", 2), ...others].slice(0, 100),
      },
      [`${repo}/actions/runs?head_sha=${pr.head}&per_page=100`]: {
        total_count: 2,
        workflow_runs: [
          { name: "CI", event: "pull_request", check_suite_id: 1 },
          { name: "Smoke test", event: "deployment_status", check_suite_id: 2 },
        ],
      },
      [`${repo}/commits/${pr.head}/status?per_page=100`]: {
        total_count: 1,
        statuses: [{ context: "Vercel", state: "success", target_url: "https://vercel.com/jaspy/league-web-app/1" }],
      },
      // Only --merge asks for these.
      [`${repo}/pulls/${pr.number}/merge`]: { merged: true, sha: MERGE_COMMIT },
      [`${repo}/commits/${MERGE_COMMIT}`]: `Merge pull request #${pr.number}\n\nAdd habits\n\n${MERGE_MARKER}`,
      [`${repo}/issues/${pr.number}/comments`]: {},
      [`${repo}/labels`]: MERGED_BY_CLAUDE,
      [`${repo}/issues/${pr.number}/labels`]: [],
    };
  };

  type Call = { args: string[]; input?: string };

  // Runs the real script on `pr` in `cwd`, once origin's main is `main`. `gh`
  // replaces some of GitHub's answers.
  function canMerge(pr: Pr, { main = shas.main, cwd = checkout, merge = false, checkRuns = 2, gh = {} } = {}) {
    git(origin, "update-ref", "refs/heads/main", main);
    writeFileSync(answersFile, JSON.stringify({ ...answers(pr, checkRuns), ...gh }));
    rmSync(logFile, { force: true });
    const result = spawnSync(process.execPath, [TSX, "--require", fakeGh, SCRIPT, String(pr.number), ...(merge ? ["--merge"] : [])], {
      cwd,
      encoding: "utf8",
      env: { ...process.env, TSX_TSCONFIG_PATH: TSCONFIG, FAKE_GH_ANSWERS: answersFile, FAKE_GH_LOG: logFile },
    });
    const out = `${result.stdout}${result.stderr}`;
    const calls: Call[] = existsSync(logFile)
      ? readFileSync(logFile, "utf8")
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line))
      : [];
    return {
      code: result.status,
      out,
      fails: out.split(/\r?\n/).filter((line) => line.startsWith("FAIL")),
      // What it asked GitHub to change: each PUT or POST, in order.
      sent: calls
        .filter(({ args }) => args.includes("--method"))
        .map(({ args, input }) => ({
          request: `${args[args.indexOf("--method") + 1]} ${args.find((arg) => arg.startsWith("repos/"))}`,
          body: JSON.parse(input ?? "null"),
        })),
    };
  }

  const MERGE_REQUESTS = [
    "PUT repos/{owner}/{repo}/pulls/1/merge",
    "POST repos/{owner}/{repo}/issues/1/comments",
    "POST repos/{owner}/{repo}/issues/1/labels",
  ];

  it("passes a clean PR, and merges nothing without --merge", () => {
    const run = canMerge(habits);
    expect(run.fails).toEqual([]);
    expect(run.out).toContain("PASS  No files Jasper merges: none of the 1 changed paths is on Jasper's list");
    expect(run.out).toContain("Every gate passed for #1.");
    expect(run.sent).toEqual([]);
    expect(run.code).toBe(0);
  });

  it("merges a clean PR with --merge, at the commit it checked and with the marker, then comments and labels it", () => {
    const run = canMerge(habits, { merge: true });
    expect(run.sent.map(({ request }) => request)).toEqual(MERGE_REQUESTS);
    const [merge, comment, label] = run.sent.map(({ body }) => body);
    expect(merge).toEqual({
      sha: habits.head,
      merge_method: "merge",
      commit_title: "Merge pull request #1 from Jaspyplayz/claude/jas-1-habits",
      commit_message: `Add habits\n\n${MERGE_MARKER}`,
    });
    expect(comment.body).toContain(`Claude Code merged this at ${habits.head}`);
    expect(comment.body).toContain("- PASS  No files Jasper merges");
    expect(label).toEqual({ labels: [MERGED_BY_CLAUDE] });
    expect(run.out).toContain(`Merged #1: merge commit ${MERGE_COMMIT}`);
    expect(run.code).toBe(0);
  });

  // GitHub would create a label that doesn't exist, so can-merge only adds
  // one Jasper made.
  it("skips the label when the repo doesn't have it", () => {
    const run = canMerge(habits, { merge: true, gh: { "repos/{owner}/{repo}/labels": "bug\nenhancement" } });
    expect(run.sent.map(({ request }) => request)).toEqual(MERGE_REQUESTS.slice(0, 2));
    expect(run.out).toContain(`Skipped the ${MERGED_BY_CLAUDE} label, which doesn't exist on GitHub yet`);
    expect(run.code).toBe(0);
  });

  // The revert gate finds Claude's merges by the marker, so a merge without
  // it is one nobody would count. The PR is merged by then, so the run still
  // comments and labels, then fails so the Agent merge run goes red.
  it("fails after the merge when the merge commit lacks the marker", () => {
    const run = canMerge(habits, { merge: true, gh: { [`repos/{owner}/{repo}/commits/${MERGE_COMMIT}`]: "Merge pull request #1\n\nAdd habits" } });
    expect(run.sent.map(({ request }) => request)).toEqual(MERGE_REQUESTS);
    expect(run.out).toContain(`Couldn't check the merge commit's marker: "${MERGE_MARKER}" is missing, so the revert gate can't see it`);
    expect(run.out).toContain("#1 is merged, but these steps failed (errors above): check the merge commit's marker. Tell Jasper.");
    expect(run.code).toBe(1);
  });

  it.each([
    ["a migration", () => migration, "drizzle/0042_habits.sql (database migrations)"],
    ["a move out of src/db/", () => moved, "src/db/schema.ts (the tables migrations are generated from)"],
  ])("refuses %s, and doesn't merge it with --merge", (_, pr, why) => {
    const run = canMerge(pr(), { merge: true });
    expect(run.fails).toEqual([`FAIL  No files Jasper merges: ${why}`]);
    expect(run.sent).toEqual([]);
    expect(run.code).toBe(REFUSED_EXIT_CODE);
  });

  it("stops when a push lands during the check", () => {
    const run = canMerge(pushed);
    expect(run.out).toContain(`#4 changed while checking (${pushed.head} became ${shas.pushedLater}). Run can-merge again.`);
    expect(run.out).not.toMatch(/^(PASS|FAIL)/m);
    expect(run.code).toBe(1);
  });

  it("stops when GitHub has more check runs than one page lists", () => {
    const run = canMerge(habits, { checkRuns: 101 });
    expect(run.out).toContain("GitHub has 101 check runs for this commit, but can-merge reads only the first 100.");
    expect(run.out).not.toMatch(/^(PASS|FAIL)/m);
    expect(run.code).toBe(1);
  });

  it.each([
    ["the merge itself, with git revert -m 1", () => shas.mergeReverted],
    ["one commit the merge brought in", () => shas.commitReverted],
  ])("refuses every PR after someone reverted a Claude merge: %s", (_, main) => {
    const run = canMerge(habits, { main: main() });
    expect(run.fails).toEqual([
      `FAIL  No Claude merge was reverted: "Merge pull request #9 from Jaspyplayz/claude/jas-9-streaks" (reverted in ${main().slice(0, 7)}). Jasper turns merging back on with a later enabledSince`,
    ]);
    expect(run.code).toBe(REFUSED_EXIT_CODE);
  });

  it("refuses when run from a checkout whose gates differ from origin/main", () => {
    const run = canMerge(habits, { cwd: edited });
    expect(run.fails).toEqual([
      "FAIL  Gate code matches main: changed from origin/main: scripts/can-merge-gates.ts. Run can-merge from an up-to-date main checkout",
    ]);
    expect(run.code).toBe(REFUSED_EXIT_CODE);
  });

  // The checkout's own copy of the switch still says on.
  it("reads the switch from origin/main, not the checkout", () => {
    const run = canMerge(habits, { main: shas.switchedOff });
    expect(run.fails).toEqual(["FAIL  Agent merging is on: enabledSince is null in .claude/agent-merge.json"]);
    expect(run.code).toBe(REFUSED_EXIT_CODE);
  });

  // The merge is the PR's only commit after the verdict. Main's commit that it
  // brought in isn't the PR's, so it doesn't count.
  it("carries a verdict over a merge of main, counting only the PR's own commits", () => {
    const run = canMerge(mergedMain);
    expect(run.fails).toEqual([]);
    expect(run.out).toContain(
      `PASS  Reviewer cleared the PR: Reviewer agent at ${shas.reviewed}: no blockers, carried over 1 commit with 0 lines outside docs`,
    );
    expect(run.code).toBe(0);
  });

  it("doesn't count a verdict on a main commit the PR merged in", () => {
    const run = canMerge({ ...mergedMain, body: body(shas.main) });
    expect(run.fails).toEqual([
      `FAIL  Reviewer cleared the PR: the reviewer saw ${shas.main.slice(0, 7)}, which isn't the head commit ${mergedMain.head.slice(0, 7)} or one this PR added before it`,
    ]);
    expect(run.code).toBe(REFUSED_EXIT_CODE);
  });
});
