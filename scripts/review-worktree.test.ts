import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

const SCRIPT = resolve("scripts/review-worktree.ts");
const TSX = resolve("node_modules/tsx/dist/cli.mjs");

const lock = (version: string) =>
  JSON.stringify({
    packages: {
      "": { name: "test" },
      "node_modules/left-pad": { version },
      "node_modules/only-on-another-computer": { version: "1.0.0", optional: true },
    },
  });

// The script finds its repo from where it runs, so this builds a small one: a
// remote, a main checkout with its own node_modules, and a branch to review.
describe("the review copy script", () => {
  const scratch = mkdtempSync(join(tmpdir(), "review-worktree-"));
  const remote = join(scratch, "remote.git");
  const repo = join(scratch, "repo");
  const copy = join(repo, ".claude", "worktrees", "review-feature");
  const sentinel = join(repo, "node_modules", "sentinel.txt");

  const git = (...args: string[]) =>
    execFileSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", ...args], {
      cwd: repo,
      encoding: "utf8",
    }).trim();
  const run = (cwd: string, ...args: string[]) => {
    const { status, stdout, stderr } = spawnSync(process.execPath, [TSX, SCRIPT, ...args], { cwd, encoding: "utf8" });
    return { status, output: stdout + stderr };
  };
  const knownToGit = () => git("worktree", "list", "--porcelain").includes("review-feature");

  beforeAll(() => {
    execFileSync("git", ["init", "-q", "--bare", remote]);
    mkdirSync(join(repo, "node_modules"), { recursive: true });
    git("init", "-q", "-b", "main");
    git("remote", "add", "origin", remote);
    writeFileSync(join(repo, ".gitignore"), "node_modules/\n.next/\n.claude/worktrees/\n");
    writeFileSync(join(repo, "package-lock.json"), lock("1.0.0"));
    writeFileSync(join(repo, "README.md"), "# Test\n");
    mkdirSync(join(repo, "docs"));
    writeFileSync(join(repo, "docs", "habits.md"), "Habits.\n");
    git("add", ".");
    git("commit", "-q", "-m", "first");
    git("switch", "-q", "-c", "feature");
    git("push", "-q", "origin", "feature");
    git("switch", "-q", "main");
    writeFileSync(sentinel, "keep me");
    writeFileSync(join(repo, "node_modules", ".package-lock.json"), lock("1.0.0"));
  }, 30_000);

  afterEach(() => {
    git("worktree", "prune");
    if (knownToGit()) git("worktree", "remove", "--force", copy);
    rmSync(copy, { recursive: true, force: true });
    git("worktree", "prune");
    git("remote", "set-url", "origin", remote);
  });

  afterAll(() => rmSync(scratch, { recursive: true, force: true }));

  it("removes the copy and leaves the main checkout's node_modules", () => {
    expect(run(repo, "feature").status).toBe(0);
    expect(existsSync(join(copy, "node_modules", "sentinel.txt"))).toBe(true);

    const removed = run(repo, "feature", "--remove");

    expect(removed.status).toBe(0);
    expect(existsSync(copy)).toBe(false);
    expect(knownToGit()).toBe(false);
    expect(readFileSync(sentinel, "utf8")).toBe("keep me");
  }, 30_000);

  it("clears a folder that only holds links, once git has forgotten it", () => {
    // What npm run build leaves: git drops the copy, but a link in
    // .next/node_modules keeps the empty folder there.
    const links = join(copy, ".next", "node_modules");
    mkdirSync(links, { recursive: true });
    symlinkSync(join(repo, "node_modules"), join(links, "@sentry"), "junction");

    const removed = run(repo, "feature", "--remove");

    expect(removed.status).toBe(0);
    expect(existsSync(copy)).toBe(false);
    expect(readFileSync(sentinel, "utf8")).toBe("keep me");
  }, 30_000);

  it("won't delete a folder git doesn't know if it holds a real file", () => {
    mkdirSync(copy, { recursive: true });
    writeFileSync(join(copy, "notes.txt"), "someone's work");

    const removed = run(repo, "feature", "--remove");

    expect(removed.status).toBe(1);
    expect(removed.output).toContain("still holds files");
    expect(readFileSync(join(copy, "notes.txt"), "utf8")).toBe("someone's work");
  }, 30_000);

  it("won't delete a folder if a real file is deep inside it, next to a link", () => {
    mkdirSync(join(copy, "sub", "deeper"), { recursive: true });
    writeFileSync(join(copy, "sub", "deeper", "notes.txt"), "someone's work");
    symlinkSync(join(repo, "node_modules"), join(copy, "sub", "link"), "junction");

    const removed = run(repo, "feature", "--remove");

    expect(removed.status).toBe(1);
    expect(removed.output).toContain("still holds files");
    expect(readFileSync(join(copy, "sub", "deeper", "notes.txt"), "utf8")).toBe("someone's work");
  }, 30_000);

  // Only Windows stops a folder being deleted while a program is using it.
  it.runIf(process.platform === "win32")("says the copy is partly deleted when another program is using it", async () => {
    expect(run(repo, "feature").status).toBe(0);
    const holder = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { cwd: join(copy, "docs"), stdio: "ignore" });

    const removed = run(repo, "feature", "--remove");
    const stopped = new Promise((done) => holder.once("exit", done));
    holder.kill();
    await stopped;

    expect(removed.status).toBe(1);
    expect(removed.output).toContain("only partly deleted");
    expect(existsSync(join(copy, "node_modules"))).toBe(false);
    expect(readFileSync(sentinel, "utf8")).toBe("keep me");
  }, 30_000);

  it("keeps the link when git refuses a copy with edits, so tests still run there", () => {
    expect(run(repo, "feature").status).toBe(0);
    writeFileSync(join(copy, "README.md"), "# Edited\n");

    const removed = run(repo, "feature", "--remove");

    expect(removed.status).toBe(1);
    expect(existsSync(copy)).toBe(true);
    expect(existsSync(join(copy, "node_modules", "sentinel.txt"))).toBe(true);
  }, 30_000);

  it("refuses to remove the copy it's running inside", () => {
    expect(run(repo, "feature").status).toBe(0);

    const removed = run(copy, "feature", "--remove");

    expect(removed.status).toBe(1);
    expect(removed.output).toContain("Run this from another folder");
    expect(knownToGit()).toBe(true);
    expect(existsSync(join(copy, "README.md"))).toBe(true);
  }, 30_000);

  it("stops when GitHub can't be reached, rather than copying an old commit", () => {
    git("remote", "set-url", "origin", join(scratch, "nothing-here.git"));

    const added = run(repo, "feature");

    expect(added.status).toBe(1);
    expect(added.output).not.toContain("isn't on GitHub");
    expect(existsSync(copy)).toBe(false);
  }, 30_000);

  it("copies the local branch when it was never pushed", () => {
    git("branch", "only-here");

    const added = run(repo, "only-here");

    expect(added.status).toBe(0);
    expect(added.output).toContain("isn't on GitHub");
    expect(run(repo, "only-here", "--remove").status).toBe(0);
  }, 30_000);

  it("warns when the shared packages don't match the branch's lock file", () => {
    expect(run(repo, "feature").output).not.toContain("differ from");
    expect(run(repo, "feature", "--remove").status).toBe(0);

    writeFileSync(join(repo, "node_modules", ".package-lock.json"), lock("2.0.0"));
    const added = run(repo, "feature");
    writeFileSync(join(repo, "node_modules", ".package-lock.json"), lock("1.0.0"));

    expect(added.status).toBe(0);
    expect(added.output).toContain("1 package");
    expect(added.output).toContain("differ from");
  }, 30_000);
});
