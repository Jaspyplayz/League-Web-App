import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SCRIPT = resolve("scripts/can-merge-reviewer-check.ts");
const TSX = resolve("node_modules/tsx/dist/cli.mjs");
const WORKFLOW = ".github/workflows/reviewer.yml";

// GitHub runs the script with the PR's event file, from a checkout that holds
// both commits. This builds the same: a repo with a base commit, a head that
// changes only docs, and a head that changes code.
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
  const heads = { base: "", docs: "", code: "" };

  beforeAll(() => {
    git("init", "-q", "-b", "main");
    heads.base = commit("README.md", "# Turnpoint\n");
    git("switch", "-q", "-c", "docs");
    heads.docs = commit("docs/habits.md", "Habits.\n");
    git("switch", "-q", "-c", "code", "main");
    heads.code = commit("src/lib/habits.ts", "export const habits = 1;\n");
  });
  afterAll(() => {
    rmSync(repo, { recursive: true, force: true });
    rmSync(events, { recursive: true, force: true });
  });

  function check(body: string | null, head: string) {
    const event = join(events, "event.json");
    writeFileSync(event, JSON.stringify({ action: "edited", pull_request: { body, head: { sha: head }, base: { sha: heads.base } } }));
    const result = spawnSync(process.execPath, [TSX, SCRIPT], {
      cwd: repo,
      encoding: "utf8",
      env: { ...process.env, GITHUB_EVENT_PATH: event },
    });
    return { code: result.status, out: `${result.stdout}${result.stderr}` };
  }

  const body = (tier: string, review: string[] = []) =>
    [`**Tier:** ${tier}`, "**Builder:** Claude Code on Opus 5.5.", "", "## Review", ...review, "", "## My read (Jasper)", ""].join("\n");

  it("passes once the reviewer cleared the head commit", () => {
    const { code, out } = check(body("normal. A habit card.", [`Reviewer agent at ${heads.code}: no blockers`]), heads.code);
    expect(out).toContain(`PASS Reviewer cleared the head commit: Reviewer agent at ${heads.code}: no blockers`);
    expect(code).toBe(0);
  });

  it("fails until the Review section has the verdict line", () => {
    const { code, out } = check(body("normal. A habit card."), heads.code);
    expect(out).toContain('FAIL Reviewer cleared the head commit: the Review section has no "Reviewer agent at <sha>: no blockers" line');
    expect(code).toBe(1);
  });

  it("fails when a new commit lands after the review", () => {
    const { code, out } = check(body("normal. A habit card.", [`Reviewer agent at ${heads.docs}: no blockers`]), heads.code);
    expect(out).toContain(`not the head commit ${heads.code.slice(0, 7)}`);
    expect(code).toBe(1);
  });

  it("passes a tiny PR that changes only docs, without the reviewer", () => {
    const { code, out } = check(body("tiny. Docs only."), heads.docs);
    expect(out).toContain("PASS Reviewer cleared the head commit: a tiny PR that changes only docs skips the reviewer");
    expect(code).toBe(0);
  });

  it("fails a tiny PR that changes code, and names the file", () => {
    const { code, out } = check(body("tiny. A copy fix."), heads.code);
    expect(out).toContain("src/lib/habits.ts");
    expect(code).toBe(1);
  });

  // GitHub sends null for an empty description, such as a bot's PR before
  // Claude adds the Review section.
  it("fails a PR with no description", () => {
    const { code, out } = check(null, heads.code);
    expect(out).toContain("FAIL Reviewer cleared the head commit");
    expect(code).toBe(1);
  });
});

describe(WORKFLOW, () => {
  // Windows checkouts end lines with \r\n.
  const workflow = () => readFileSync(WORKFLOW, "utf8").replace(/\r\n/g, "\n");

  // Main's ruleset requires the check by this job name.
  it("runs a job named reviewer on PRs into main", () => {
    expect(workflow()).toMatch(/^jobs:\n {2}reviewer:$/m);
    expect(workflow()).toMatch(/^ {4}branches: \[main\]$/m);
  });

  // So a new verdict line passes it, and a new commit fails it again.
  it("runs again when the description is edited and when a commit is pushed", () => {
    const types = workflow().match(/^ {4}types: \[(.*)\]$/m)?.[1].split(/,\s*/);
    expect(types).toEqual(expect.arrayContaining(["opened", "edited", "synchronize", "reopened"]));
  });

  // Text from the PR inside a run step would run as shell code.
  it("never puts the PR's text into the workflow", () => {
    expect(workflow()).not.toMatch(/github\.event\.pull_request\.(body|title|head\.ref)/);
  });
});
