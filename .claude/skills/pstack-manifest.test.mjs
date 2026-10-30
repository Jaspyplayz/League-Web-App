import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// pstack is copied in unchanged (decision record 0014), so every copied file
// must keep the Git hash and mode pstack's own repo gives it.
// pstack-manifest.txt lists them; these tests fail on any edit to a copied file.

const root = fileURLToPath(new URL("../..", import.meta.url));
const git = (args, input) => execFileSync("git", args, { cwd: root, encoding: "utf8", input });

const manifest = readFileSync(new URL("./pstack-manifest.txt", import.meta.url), "utf8")
  .split(/\r?\n/)
  .filter((line) => line && !line.startsWith("#"))
  .map((line) => {
    const [mode, hash, path] = line.split(" ");
    return { mode, hash, path };
  });

// The top folders pstack owns: each skill folder, plus the agent and hook
// files, which sit beside the repo's own.
const pstackFolders = [...new Set(manifest.map(({ path }) => path.split("/").slice(0, 3).join("/")))].filter(
  (folder) => folder.startsWith(".claude/skills/"),
);

describe("the pstack copy", () => {
  it("lists all 65 skills, 4 agents and the startup text", () => {
    expect(pstackFolders).toHaveLength(65);
    expect(manifest.filter(({ path }) => path.startsWith(".claude/agents/"))).toHaveLength(4);
    expect(manifest.map(({ path }) => path)).toContain(".claude/hooks/pstack-session-start-context.md");
  });

  it("has every listed file", () => {
    expect(manifest.filter(({ path }) => !existsSync(`${root}/${path}`)).map(({ path }) => path)).toEqual([]);
  });

  // git hash-object reads the file on disk the way a commit would store it, so
  // an edit fails here before it's committed, and Windows line endings don't count.
  it("has every file exactly as pstack's repo stores it", () => {
    const hashes = git(["hash-object", "--stdin-paths"], manifest.map(({ path }) => path).join("\n")).trim().split("\n");
    const changed = manifest.filter(({ hash }, i) => hashes[i] !== hash).map(({ path }) => path);
    expect(changed).toEqual([]);
  });

  // Seven of pstack's scripts are programs that can run. Git on Windows doesn't
  // see that bit on disk, so the mode Git will commit is the one checked.
  it("gives every file the mode pstack's repo gives it", () => {
    const modes = new Map(
      git(["ls-files", "--stage", "--", ...manifest.map(({ path }) => path)])
        .trim()
        .split("\n")
        .map((line) => [line.split("\t")[1], line.split(" ")[0]]),
    );
    expect(manifest.filter(({ mode, path }) => modes.get(path) !== mode).map(({ path }) => path)).toEqual([]);
  });

  it("has no file in a pstack skill folder that pstack didn't ship", () => {
    const listed = new Set(manifest.map(({ path }) => path));
    const tracked = git(["ls-files", "--cached", "--others", "--exclude-standard", "--", ...pstackFolders]).trim().split("\n");
    expect(tracked.filter((path) => !listed.has(path))).toEqual([]);
  });
});
