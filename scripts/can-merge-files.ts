// The files and lines a PR changes, as the gates in scripts/can-merge-gates.ts
// see them. scripts/can-merge.ts and the reviewer check call these.

import { execFileSync, spawnSync } from "node:child_process";
import { BINARY_LINES, type ChangedLines, type ReviewHistory } from "./can-merge-gates";

// Three dots is what the PR shows. Without rename detection, a moved file
// lists its old path too, so moving a file out of src/db/ is still risky.
// -z lists paths unquoted, so a name with unusual characters still matches.
export function changedPaths(base: string, head: string, cwd?: string): string[] {
  const output = execFileSync("git", ["diff", "--name-only", "--no-renames", "-z", `${base}...${head}`], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return output.split("\0").filter(Boolean);
}

// Lines added and deleted in each file between two commits, from
// `git diff --numstat`. A binary file shows "-" there and counts as
// BINARY_LINES added. A mode-only change is listed with 0 lines. With -z the
// path is written raw, so it keeps any tab in it.
export function changedLines(range: string[], cwd?: string): ChangedLines {
  const output = execFileSync("git", ["diff", "--numstat", "--no-renames", "-z", ...range], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const lines: ChangedLines = {};
  for (const record of output.split("\0").filter(Boolean)) {
    const match = record.match(/^(\d+|-)\t(\d+|-)\t([\s\S]*)$/);
    if (!match) continue;
    const [, added, deleted, path] = match;
    lines[path] = added === "-" ? { added: BINARY_LINES, deleted: 0 } : { added: Number(added), deleted: Number(deleted) };
  }
  return lines;
}

function git(args: string[], cwd?: string): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function isAncestor(sha: string, of: string, cwd?: string): boolean {
  return spawnSync("git", ["merge-base", "--is-ancestor", sha, of], { cwd, stdio: "ignore" }).status === 0;
}

// What the reviewer gate needs from git: the PR's changed lines, and what
// changed after each commit a verdict names (decision record 0017). A verdict
// counts only on a commit the PR added: an ancestor of the head that no base
// already has, so one naming a main commit doesn't count. Both callers pass
// origin/main as a second base, since main may have moved past GitHub's base
// commit and been merged in; a base git can't find is left out.
export function reviewHistory(base: string, head: string, cwd?: string, otherBases: string[] = []): ReviewHistory {
  const bases = [base, ...otherBases].filter(
    (b) => spawnSync("git", ["rev-parse", "--verify", "--quiet", `${b}^{commit}`], { cwd, stdio: "ignore" }).status === 0,
  );
  return {
    lines: changedLines([`${base}...${head}`], cwd),
    since: (sha) => {
      // A verdict's commit is text from the PR description, so it reaches git
      // only as a hex commit name, never as an option.
      if (!/^[0-9a-f]{7,40}$/.test(sha)) return undefined;
      if (!isAncestor(sha, head, cwd) || bases.some((b) => isAncestor(sha, b, cwd))) return undefined;
      // Only the PR's own commits, not main's commits merged in after it.
      const commits = Number(git(["rev-list", "--count", `${sha}..${head}`, ...bases.map((b) => `^${b}`)], cwd));
      return { commits, lines: changedLines([sha, head], cwd), files: changedPaths(base, sha, cwd) };
    },
  };
}
