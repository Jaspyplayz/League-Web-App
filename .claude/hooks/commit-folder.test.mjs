import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { commitFolder, hasPackages } from "./commit-folder.mjs";

describe("commitFolder", () => {
  const here = resolve("/repo");

  it("is the folder Claude is in for a plain commit", () => {
    expect(commitFolder('git commit -m "Fix the lead graph"', here)).toBe(here);
    expect(commitFolder("npm test && git commit -m test", here)).toBe(here);
  });

  it("follows -C to the folder the commit lands in", () => {
    expect(commitFolder("git -C .claude/worktrees/agent-1 commit -m test", here)).toBe(
      resolve(here, ".claude/worktrees/agent-1"),
    );
    expect(commitFolder('git -C "/home/me/My Repo" commit -m test', here)).toBe(
      resolve("/home/me/My Repo"),
    );
  });

  it("is null for commands that don't commit", () => {
    expect(commitFolder("git status", here)).toBeNull();
    expect(commitFolder("git log --grep commit", here)).toBeNull();
  });
});

describe("hasPackages", () => {
  // A checkout with packages installed, and a worktree inside it like the ones
  // subagents get, which has no node_modules of its own.
  const checkout = mkdtempSync(join(tmpdir(), "commit-folder-"));
  mkdirSync(join(checkout, "node_modules"));
  const worktree = join(checkout, ".claude", "worktrees", "agent-1");
  mkdirSync(worktree, { recursive: true });
  const bare = mkdtempSync(join(tmpdir(), "commit-folder-"));

  afterAll(() => {
    rmSync(checkout, { recursive: true, force: true });
    rmSync(bare, { recursive: true, force: true });
  });

  it("finds a checkout's own packages", () => {
    expect(hasPackages(checkout)).toBe(true);
  });

  it("finds the main checkout's packages from a worktree inside it", () => {
    expect(hasPackages(worktree)).toBe(true);
  });

  it("ends at the top of the drive", () => {
    // Whether some folder above the temp folder has packages depends on the
    // computer; what matters is that the walk stops with an answer.
    expect(hasPackages(bare)).toBeTypeOf("boolean");
  });
});
