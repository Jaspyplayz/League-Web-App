// Helpers for check-before-commit.mjs, in their own file so
// commit-folder.test.mjs can test them without running lint and typecheck.

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

// `git commit`, or `git -C <folder> commit`, which commits in another folder
// such as a worktree. The folder may be in quotes.
const COMMIT = /\bgit\s+(?:-C\s+("[^"]*"|'[^']*'|\S+)\s+)?commit\b/;

// The folder a command commits in, or null when it doesn't commit. `here` is
// the folder Claude is working in, which a relative -C folder starts from.
export function commitFolder(command, here) {
  const commit = command.match(COMMIT);
  if (!commit) return null;
  return commit[1] ? resolve(here, commit[1].replace(/^["']|["']$/g, "")) : here;
}

// Whether lint and typecheck can run in this checkout. A worktree in
// .claude/worktrees/ has no node_modules of its own, but npm and Node find the
// main checkout's by looking in the folders above, so look there too.
export function hasPackages(checkout) {
  for (let folder = checkout; ; folder = dirname(folder)) {
    if (existsSync(join(folder, "node_modules"))) return true;
    if (dirname(folder) === folder) return false;
  }
}
