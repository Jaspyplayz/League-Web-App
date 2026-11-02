import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SCRIPT = resolve("scripts/can-merge-reviewer-check.ts");
const TSX = resolve("node_modules/tsx/dist/cli.mjs");
const WORKFLOW = ".github/workflows/reviewer.yml";

// GitHub runs the script with the PR's event file, from a checkout that holds
// both commits. This builds the same: a repo with a base commit, a head that
// changes only docs, a head that changes one line of code, a small fix after
// it, and a big change after that.
describe("the reviewer check GitHub requires", () => {
  const repo = mkdtempSync(join(tmpdir(), "reviewer-check-"));
  const events = mkdtempSync(join(tmpdir(), "reviewer-check-events-"));
  const git = (...args: string[]) =>
    execFileSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", ...args], {
      cwd: repo,
      encoding: "utf8",
    }).trim();
  const commit = (path: string, text: string) => {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), text);
    git("add", ".");
    git("commit", "-q", "-m", path);
    return git("rev-parse", "HEAD");
  };
  const heads = { base: "", docs: "", code: "", fix: "", big: "" };

  beforeAll(() => {
    git("init", "-q", "-b", "main");
    heads.base = commit("README.md", "# Turnpoint\n");
    git("switch", "-q", "-c", "docs");
    heads.docs = commit("docs/habits.md", "Habits.\n");
    git("switch", "-q", "-c", "code", "main");
    heads.code = commit("src/lib/habits.ts", "export const habits = 1;\n");
    heads.fix = commit("src/lib/habits.ts", "export const habits = 2;\n");
    heads.big = commit("src/lib/streaks.ts", "export const streak = 0;\n".repeat(41));
  });
  afterAll(() => {
    rmSync(repo, { recursive: true, force: true });
    rmSync(events, { recursive: true, force: true });
  });

  function check(body: string | null, head: string, cwd = repo, base = heads.base) {
    const event = join(events, "event.json");
    writeFileSync(event, JSON.stringify({ action: "edited", pull_request: { body, head: { sha: head }, base: { sha: base } } }));
    const result = spawnSync(process.execPath, [TSX, SCRIPT], {
      cwd,
      encoding: "utf8",
      env: { ...process.env, GITHUB_EVENT_PATH: event },
    });
    return { code: result.status, out: `${result.stdout}${result.stderr}` };
  }

  const body = (tier: string, review: string[] = []) =>
    [`**Tier:** ${tier}`, "**Builder:** Claude Code on Opus 5.5.", "", "## Review", ...review, "", "## My read (Jasper)", ""].join("\n");

  it("passes once the reviewer cleared the head commit", () => {
    const { code, out } = check(body("normal. A habit card.", [`Reviewer agent at ${heads.code}: no blockers`]), heads.code);
    expect(out).toContain(`PASS Reviewer cleared the PR: Reviewer agent at ${heads.code}: no blockers`);
    expect(code).toBe(0);
  });

  it("fails until the Review section has the verdict line", () => {
    const { code, out } = check(body("normal. A habit card."), heads.code);
    expect(out).toContain('FAIL Reviewer cleared the PR: the Review section has no "Reviewer agent at <sha>: no blockers" line');
    expect(code).toBe(1);
  });

  it("fails a verdict on a commit that isn't on the branch", () => {
    const { code, out } = check(body("normal. A habit card.", [`Reviewer agent at ${heads.docs}: no blockers`]), heads.code);
    expect(out).toContain(`isn't the head commit ${heads.code.slice(0, 7)} or one this PR added before it`);
    expect(code).toBe(1);
  });

  it("fails a verdict on the base commit, which the PR didn't add", () => {
    const { code, out } = check(body("normal. A habit card.", [`Reviewer agent at ${heads.base}: no blockers`]), heads.fix);
    expect(out).toContain("or one this PR added before it");
    expect(code).toBe(1);
  });

  it("carries a verdict over a small fix after the review", () => {
    const { code, out } = check(body("normal. A habit card.", [`Reviewer agent at ${heads.code}: no blockers`]), heads.fix);
    expect(out).toContain("carried over 1 commit with 2 lines outside docs");
    expect(code).toBe(0);
  });

  it("fails when a big change lands after the review", () => {
    const { code, out } = check(body("normal. A habit card.", [`Reviewer agent at ${heads.code}: no blockers`]), heads.big);
    expect(out).toContain("43 lines outside docs changed after the verdict");
    expect(code).toBe(1);
  });

  it("passes a tiny PR that changes only docs, without the reviewer", () => {
    const { code, out } = check(body("tiny. Docs only."), heads.docs);
    expect(out).toContain("PASS Reviewer cleared the PR: a tiny PR that changes only docs skips the reviewer");
    expect(code).toBe(0);
  });

  it("passes a tiny PR that changes one line of code, without the reviewer", () => {
    const { code, out } = check(body("tiny. A copy fix."), heads.code);
    expect(out).toContain("PASS Reviewer cleared the PR: a tiny PR that changes 1 lines outside docs");
    expect(code).toBe(0);
  });

  it("fails a tiny PR past the limit, and names the files", () => {
    const { code, out } = check(body("tiny. A copy fix."), heads.big);
    expect(out).toContain("src/lib/habits.ts, src/lib/streaks.ts");
    expect(code).toBe(1);
  });

  // GitHub sends null for an empty description, such as a bot's PR before
  // Claude adds the Review section.
  it("fails a PR with no description", () => {
    const { code, out } = check(null, heads.code);
    expect(out).toContain("FAIL Reviewer cleared the PR");
    expect(code).toBe(1);
  });

  // Like the workflow's checkout: main's branch only, cloned through git's
  // transport, so a commit on another branch is missing until fetched.
  const cloneOfMain = (name: string) => {
    const checkout = join(events, name);
    execFileSync("git", ["clone", "--quiet", "--no-local", "--single-branch", "--branch", "main", repo, checkout]);
    return checkout;
  };

  it("fetches a head commit the checkout doesn't have, as a fork's is", () => {
    const checkout = cloneOfMain("fork-checkout");
    const { code, out } = check(body("normal. A habit card.", [`Reviewer agent at ${heads.code}: no blockers`]), heads.code, checkout);
    expect(out).toContain(`PASS Reviewer cleared the PR: Reviewer agent at ${heads.code}: no blockers`);
    expect(code).toBe(0);
  });

  // The commit names reach git as arguments, so one starting with "--" would
  // be read as an option. Without the hex check, this base makes git write the
  // diff to a file instead of listing it, so a tiny PR looks like it changed
  // nothing and passes.
  it("doesn't let a base that looks like an option hide the PR's files", () => {
    const { code, out } = check(body("tiny. A copy fix."), heads.big, repo, `--output=${join(events, "leak")}`);
    expect(out).not.toContain("PASS");
    expect(code).toBe(1);
    expect(readdirSync(events).filter((name) => name.startsWith("leak"))).toEqual([]);
  });

  // Without the hex check, this head makes git fetch run a command.
  it("doesn't let a head that looks like an option run a command", () => {
    const pwned = join(events, "pwned");
    const { code, out } = check(body("normal. A habit card."), `--upload-pack=touch ${pwned}`, cloneOfMain("option-checkout"));
    expect(out).not.toContain("PASS");
    expect(code).toBe(1);
    expect(existsSync(pwned)).toBe(false);
  });
});

describe(WORKFLOW, () => {
  // Windows checkouts end lines with \r\n.
  const workflow = () => readFileSync(WORKFLOW, "utf8").replace(/\r\n/g, "\n");
  const workflowLines = () =>
    workflow()
      .split("\n")
      .filter((line) => line.trim() !== "" && !line.trim().startsWith("#"))
      .map((line) => line.replace(/\s+#.*$/, ""));

  // Main's ruleset requires the check by this job name.
  it("runs a job named reviewer", () => {
    expect(workflow()).toMatch(/^jobs:\n {2}reviewer:$/m);
  });

  // Every line of the file, so any new trigger, setting, step or option, even
  // one above jobs: such as a default shell, changes this test too. Both PR
  // triggers run on edits, so a new verdict passes the check, and on pushes,
  // so a new commit checks it again. The whole history keeps the PR's base
  // commit here.
  it("runs only main's checkout, node, npm ci and the check script, on both PR triggers, for at most 10 minutes", () => {
    const types = "    types: [opened, edited, synchronize, reopened, ready_for_review]";
    expect(workflowLines()).toEqual([
      "name: Reviewer",
      "on:",
      "  pull_request_target:",
      "    branches: [main]",
      types,
      "  pull_request:",
      "    branches: [main]",
      types,
      "permissions:",
      "  contents: read",
      "concurrency:",
      "  group: reviewer-${{ github.event_name }}-${{ github.event.pull_request.number }}",
      "  cancel-in-progress: true",
      "jobs:",
      "  reviewer:",
      "    runs-on: ubuntu-latest",
      "    timeout-minutes: 10",
      "    steps:",
      "      - uses: actions/checkout@v7",
      "        with:",
      "          ref: main",
      "          fetch-depth: 0",
      "          persist-credentials: false",
      "      - uses: actions/setup-node@v7",
      "        with:",
      "          node-version-file: .nvmrc",
      "          package-manager-cache: false",
      "      - run: npm ci",
      "      - run: npx tsx scripts/can-merge-reviewer-check.ts",
    ]);
  });

  // The tests read the file line by line. A bare carriage return or a no-break
  // space would let a real step hide inside what they read as a comment.
  it("is plain ASCII with \\n line ends, so the tests read the lines GitHub reads", () => {
    expect(workflow()).toMatch(/^[\x20-\x7E\n]*$/);
  });

  // Text from the PR inside a run step would run as shell code.
  it("reads the event only in its concurrency group, one per trigger", () => {
    expect(workflowLines().filter((line) => /github\b|\$\{\{/.test(line)).map((line) => line.trim())).toEqual([
      "group: reviewer-${{ github.event_name }}-${{ github.event.pull_request.number }}",
    ]);
  });

  // GitHub counts a skipped job as passing a required check, and a paths
  // filter leaves the check waiting forever on the PRs it skips.
  it("runs the job on every PR", () => {
    expect(workflow()).not.toMatch(/^\s*if:/m);
    expect(workflow()).not.toMatch(/^\s*paths(-ignore)?:/m);
  });

  it("fails the job whenever the check fails", () => {
    expect(workflow()).not.toMatch(/continue-on-error/);
    expect(workflow()).toMatch(/\n {6}- run: npx tsx scripts\/can-merge-reviewer-check\.ts\n?$/);
  });
});
