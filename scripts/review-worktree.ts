// A throwaway copy of a branch to review, in .claude/worktrees/review-<branch>.
// Setting one up by hand failed four ways in one session, so the steps live here.
//
//   npx tsx scripts/review-worktree.ts <branch>            tests, lint and typecheck work
//   npx tsx scripts/review-worktree.ts <branch> --full     npm run build and next dev work too
//   npx tsx scripts/review-worktree.ts <branch> --remove   delete the copy
//
// Run it from any checkout of this repo. It never changes the branch itself.

import { execFileSync, execSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, unlinkSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
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
  } catch (error) {
    // Any other failure, such as no network, must stop here: the local branch
    // could be an old commit, and a reviewer would clear the wrong code.
    if (!String((error as { stderr?: string }).stderr).includes("couldn't find remote ref")) throw error;
    console.log(`${branch} isn't on GitHub, so this copies the local branch.`);
    return git(root, "rev-parse", "--verify", branch);
  }
}

// How many packages the branch's lock file wants at a version the main checkout
// doesn't have. Optional ones are skipped, because each computer installs only
// the ones for its own system.
function packagesOutOfStep(root: string, folder: string): number {
  const installedFile = join(root, "node_modules", ".package-lock.json");
  if (!existsSync(installedFile)) return 0;
  type Lock = { packages: Record<string, { version?: string; optional?: boolean }> };
  const installed = (JSON.parse(readFileSync(installedFile, "utf8")) as Lock).packages;
  const wanted = (JSON.parse(readFileSync(join(folder, "package-lock.json"), "utf8")) as Lock).packages;
  return Object.entries(wanted).filter(
    ([name, { version, optional }]) => name.startsWith("node_modules/") && !optional && installed[name]?.version !== version,
  ).length;
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
  if (options.full) return;
  console.log("Tests, lint and typecheck work here. For npm run build or next dev, use --full.");
  const outOfStep = packagesOutOfStep(root, folder);
  if (outOfStep > 0) {
    console.log(`But ${outOfStep} package${outOfStep === 1 ? "" : "s"} here differ from this branch's package-lock.json, so a pass may not count. Use --full to get the right ones.`);
  }
}

// Whether a folder holds anything but links and empty folders. npm run build
// leaves a link in .next/node_modules that stops git deleting the folder.
// Walked by hand, because readdirSync's recursive option follows a junction.
function holdsRealFiles(folder: string): boolean {
  return readdirSync(folder, { withFileTypes: true }).some(
    (entry) => entry.isFile() || (entry.isDirectory() && holdsRealFiles(join(folder, entry.name))),
  );
}

function removeFromGit(root: string, folder: string): void {
  // Take the link off first, so nothing that deletes the folder can follow it
  // into the main checkout's node_modules.
  const modules = join(folder, "node_modules");
  const linkedTo = lstatSync(modules, { throwIfNoEntry: false })?.isSymbolicLink() ? readlinkSync(modules) : null;
  if (linkedTo) unlinkSync(modules);
  try {
    // No --force: git refuses if the copy has edits, so they get looked at first.
    git(root, "worktree", "remove", folder);
  } catch (error) {
    // The copy stays, so its tests should still run.
    if (linkedTo) symlinkSync(linkedTo, modules, "junction");
    throw error;
  }
}

function remove(root: string, folder: string): void {
  if (!existsSync(folder)) throw new Error(`${folder} doesn't exist, so there's nothing to remove.`);
  // Windows won't delete a folder in use, and git would already have deleted
  // the files inside it by the time it found that out.
  const fromFolder = relative(folder, process.cwd());
  if (!fromFolder.startsWith("..") && !isAbsolute(fromFolder)) {
    throw new Error(`This is running inside ${folder}. Run this from another folder.`);
  }

  const known = git(root, "worktree", "list", "--porcelain")
    .split("\n")
    .some((line) => line.startsWith("worktree ") && resolve(line.slice("worktree ".length)) === resolve(folder));
  if (known) removeFromGit(root, folder);

  if (existsSync(folder)) {
    if (holdsRealFiles(folder)) throw new Error(`${folder} still holds files git doesn't know about. Look at them, then delete the folder by hand.`);
    // rmSync takes a link away without following it.
    rmSync(folder, { recursive: true, force: true });
  }
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
