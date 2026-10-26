import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { changedPaths } from "./can-merge-files";
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
