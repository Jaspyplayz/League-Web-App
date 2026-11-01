// A throwaway copy of a branch to review, in .claude/worktrees/review-<branch>.
// Setting one up by hand failed four ways in one session, so the steps live here.
//
//   npx tsx scripts/review-worktree.ts <branch>            tests, lint and typecheck work
//   npx tsx scripts/review-worktree.ts <branch> --full     npm run build and next dev work too
//   npx tsx scripts/review-worktree.ts <branch> --remove   delete the copy
//
// Run it from any checkout of this repo. It never changes the branch itself.

import { execFileSync, execSync } from "node:child_process";
import { existsSync, lstatSync, symlinkSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";

const USAGE = "Usage: npx tsx scripts/review-worktree.ts <branch> [--full | --remove]";

const { values: options, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    full: { type: "boolean", default: false },
    remove: { type: "boolean", default: false },
  },
});

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

// The newest commit on GitHub, or the local branch if it was never pushed.
function commitToReview(root: string, branch: string): string {
  try {
    git(root, "fetch", "--quiet", "origin", branch);
    return git(root, "rev-parse", "FETCH_HEAD");
  } catch {
    console.log(`${branch} isn't on GitHub, so this copies the local branch.`);
    return git(root, "rev-parse", "--verify", branch);
  }
}

function add(root: string, folder: string, branch: string): void {
  if (existsSync(folder)) throw new Error(`${folder} already exists. Run with --remove first.`);
  // Detached, because git won't check out a branch that's already checked out
  // in another folder, and a builder's own folder usually has it.
  git(root, "worktree", "add", "--quiet", "--detach", folder, commitToReview(root, branch));

  if (options.full) {
    // Turbopack won't read files outside its folder, so a link to node_modules
    // breaks npm run build and next dev.
    execSync("npm ci", { cwd: folder, stdio: "inherit" });
  } else {
    // A junction needs no admin rights on Windows, and Node ignores the type elsewhere.
    symlinkSync(join(root, "node_modules"), join(folder, "node_modules"), "junction");
  }
  console.log(`Ready at ${git(folder, "rev-parse", "--short", "HEAD")}: ${folder}`);
  if (!options.full) console.log("Tests, lint and typecheck work here. For npm run build or next dev, use --full.");
}

function remove(root: string, folder: string): void {
  if (!existsSync(folder)) throw new Error(`${folder} doesn't exist, so there's nothing to remove.`);
  // Take the link off first, so nothing that deletes the folder can follow it
  // into the main checkout's node_modules.
  const modules = join(folder, "node_modules");
  if (lstatSync(modules, { throwIfNoEntry: false })?.isSymbolicLink()) unlinkSync(modules);
  // No --force: git refuses if the copy has edits, so they get looked at first.
  git(root, "worktree", "remove", folder);
  console.log(`Removed ${folder}`);
}

function main(): void {
  const branch = positionals[0];
  if (!branch || positionals.length > 1 || (options.full && options.remove)) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }
  // The shared .git folder is in the main checkout, wherever this runs from.
  const root = dirname(git(process.cwd(), "rev-parse", "--path-format=absolute", "--git-common-dir"));
  const folder = join(root, ".claude", "worktrees", `review-${branch.replace(/[^a-zA-Z0-9_-]+/g, "-")}`);
  if (options.remove) remove(root, folder);
  else add(root, folder, branch);
}

try {
  main();
} catch (error) {
  // git's own message is in stderr, and it's the part that says what went wrong.
  const stderr = (error as { stderr?: string }).stderr;
  console.error(stderr?.trim() || (error instanceof Error ? error.message : error));
  process.exitCode = 1;
}
