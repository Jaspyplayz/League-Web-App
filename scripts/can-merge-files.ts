// The files and lines a PR changes, as the gates in scripts/can-merge-gates.ts
// see them. scripts/can-merge.ts and the reviewer check call these.

import { execFileSync, spawnSync } from "node:child_process";
import type { ChangedLines, ReviewHistory } from "./can-merge-gates";

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

// Lines changed in each file between two commits, from `git diff --numstat`.
// A binary file shows "-" there and counts 0.
export function changedLines(range: string[], cwd?: string): ChangedLines {
  const output = execFileSync("git", ["diff", "--numstat", "--no-renames", "-z", ...range], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const lines: ChangedLines = {};
  for (const record of output.split("\0").filter(Boolean)) {
    const [added, deleted, path] = record.split("\t");
    lines[path] = (Number(added) || 0) + (Number(deleted) || 0);
  }
  return lines;
}

// What the reviewer gate needs from git: the PR's changed lines, and what
// changed after each commit a verdict names (decision record 0017).
export function reviewHistory(base: string, head: string, cwd?: string): ReviewHistory {
  return {
    lines: changedLines([`${base}...${head}`], cwd),
    since: (sha) => {
      // A verdict's commit is text from the PR description, so it reaches git
      // only as a hex commit name, never as an option.
      if (!/^[0-9a-f]{7,40}$/.test(sha)) return undefined;
      const ancestor = spawnSync("git", ["merge-base", "--is-ancestor", sha, head], { cwd, stdio: "ignore" });
      if (ancestor.status !== 0) return undefined;
      const commits = Number(
        execFileSync("git", ["rev-list", "--count", `${sha}..${head}`], { cwd, encoding: "utf8" }).trim(),
      );
      return { commits, lines: changedLines([sha, head], cwd) };
    },
  };
}
