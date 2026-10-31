import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { changedLines, changedPaths, reviewHistory } from "./can-merge-files";
import { BINARY_LINES } from "./can-merge-gates";
import { riskyFiles } from "./risky-paths";

describe("changedPaths", () => {
  const repo = mkdtempSync(join(tmpdir(), "can-merge-files-"));
  const git = (...args: string[]) =>
    execFileSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", ...args], {
      cwd: repo,
      encoding: "utf8",
    });
  afterAll(() => rmSync(repo, { recursive: true, force: true }));

  // Otherwise moving a file out of src/db/ would list only its new path, which isn't risky.
  it("lists both paths of a renamed file, so a move out of src/db/ stays risky", () => {
    git("init", "-q", "-b", "main");
    mkdirSync(join(repo, "src", "db"), { recursive: true });
    writeFileSync(join(repo, "src", "db", "notes.ts"), "export const notes = 1;\n");
    git("add", ".");
    git("commit", "-q", "-m", "base");
    git("switch", "-q", "-c", "move");
    mkdirSync(join(repo, "src", "lib"), { recursive: true });
    git("mv", "src/db/notes.ts", "src/lib/notes.ts");
    git("commit", "-q", "-m", "move");

    const files = changedPaths("main", "move", repo);
    expect([...files].sort()).toEqual(["src/db/notes.ts", "src/lib/notes.ts"]);
    expect(riskyFiles(files).map((file) => file.path)).toEqual(["src/db/notes.ts"]);
  });
});

// The reviewer gate's counts come from these, on a real repo (decision record 0017).
describe("changedLines and reviewHistory", () => {
  const repo = mkdtempSync(join(tmpdir(), "review-history-"));
  const git = (...args: string[]) =>
    execFileSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", ...args], {
      cwd: repo,
      encoding: "utf8",
    }).trim();
  const write = (path: string, text: string | Buffer) => {
    mkdirSync(join(repo, path, ".."), { recursive: true });
    writeFileSync(join(repo, path), text);
  };
  const commit = (message: string) => {
    git("add", "-A");
    git("commit", "-q", "-m", message);
    return git("rev-parse", "HEAD");
  };
  const shas = { base: "", verdict: "", mainLater: "", merged: "", head: "" };

  beforeAll(() => {
    git("init", "-q", "-b", "main");
    write("src/a.ts", "export const a = 1;\n");
    write("src/guard.ts", "export const guard = 1;\n");
    write("scripts/run.sh", "echo hi\n");
    write("src/shared.ts", "export const shared = 1;\n");
    shas.base = commit("base");
    git("switch", "-q", "-c", "pr");
    write("src/a.ts", "export const a = 2;\n");
    write("src/guard.ts", "export const guard = 2;\nexport const more = 3;\n");
    shas.verdict = commit("reviewed");
    git("switch", "-q", "main");
    write("src/main-only.ts", "export const m = 1;\n".repeat(50));
    shas.mainLater = commit("main moves on");
    git("switch", "-q", "pr");
    git("merge", "-q", "--no-edit", "main");
    shas.merged = git("rev-parse", "HEAD");
    // After the verdict: put guard.ts back, make run.sh runnable, add a
    // binary and a file with a tab in its name.
    git("checkout", shas.base, "--", "src/guard.ts");
    chmodSync(join(repo, "scripts/run.sh"), 0o755);
    write("public/font.bin", Buffer.from([0, 1, 2, 0, 3]));
    write("src/tab\tname.ts", "export const t = 1;\n".repeat(3));
    shas.head = commit("after the verdict");
  });
  afterAll(() => rmSync(repo, { recursive: true, force: true }));

  it("counts a binary as BINARY_LINES, a mode-only change as 0, and keeps a tab in a path", () => {
    const lines = changedLines([shas.verdict, shas.head], repo);
    expect(lines["public/font.bin"]).toEqual({ added: BINARY_LINES, deleted: 0 });
    expect(lines["scripts/run.sh"]).toEqual({ added: 0, deleted: 0 });
    expect(lines["src/tab\tname.ts"]).toEqual({ added: 3, deleted: 0 });
  });

  // As the callers do, main is a second base, since it moved past the PR's base.
  const history = () => reviewHistory(shas.base, shas.head, repo, ["main", "origin/main"]);

  it("places a verdict on a commit the PR added, counting only the PR's commits after it", () => {
    const since = history().since(shas.verdict);
    // The merge and the commit after it; main's own commit isn't the PR's.
    expect(since?.commits).toBe(2);
    expect(since?.files.sort()).toEqual(["src/a.ts", "src/guard.ts"]);
    // guard.ts went back to main's version, so it shows as changed.
    expect(since?.lines["src/guard.ts"]).toEqual({ added: 1, deleted: 2 });
    expect(since?.created.sort()).toEqual(["public/font.bin", "src/main-only.ts", "src/tab\tname.ts"]);
  });

  it("works with a 7-character commit", () => {
    expect(history().since(shas.verdict.slice(0, 7))?.commits).toBe(2);
  });

  it.each([
    ["the base commit", () => shas.base],
    ["a main commit merged in", () => shas.mainLater],
    ["a commit not on the branch", () => git("commit-tree", "-m", "dropped", `${shas.verdict}^{tree}`)],
    ["an option instead of a commit", () => "--help"],
  ])("doesn't place a verdict on %s", (_, sha) => {
    expect(history().since(sha())).toBeUndefined();
  });

  it("leaves out a base git can't find, here origin/main", () => {
    expect(history().since(shas.verdict)).toBeDefined();
  });
});
