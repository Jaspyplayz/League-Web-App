// Claude Code hook: run lint and typecheck before Claude makes a git commit.
//
// CI runs these on every PR, so catching a failure here saves a red check and
// a second push. Claude Code calls this script before each Bash command and
// passes the command as JSON on stdin. Exit code 2 blocks the command, and
// whatever we print to stderr is shown to Claude so it can fix the errors.
// This only checks Claude's commits; commits you type yourself are not affected.

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { commitFolder, hasPackages } from "./commit-folder.mjs";

// Files whose changes can break lint or typecheck. Docs-only commits skip the check.
const CODE_FILE = /\.(ts|tsx|js|jsx|mjs|cjs|json)$/;

function run(command, cwd) {
  return execSync(command, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

const input = JSON.parse(readFileSync(0, "utf8"));
const command = input.tool_input?.command ?? "";
// Check the checkout the commit lands in. `cwd` is the folder Claude is working
// in, which is a worktree's root inside a worktree; CLAUDE_PROJECT_DIR always
// points at the main checkout, so it's only the fallback.
const here = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
const folder = commitFolder(command, here);
if (!folder) process.exit(0);

let projectDir;
try {
  projectDir = run("git rev-parse --show-toplevel", folder).trim();
} catch {
  // Not a git folder, so the commit will fail on its own.
  process.exit(0);
}

// Without installed packages there is nothing to check with; let CI catch it.
if (!hasPackages(projectDir)) process.exit(0);

// Staged files, plus unstaged ones in case the commit uses -a.
const changed = run("git diff --cached --name-only && git diff --name-only", projectDir)
  .split("\n")
  .filter((file) => CODE_FILE.test(file));
if (changed.length === 0) process.exit(0);

for (const script of ["lint", "typecheck"]) {
  try {
    run(`npm run ${script}`, projectDir);
  } catch (error) {
    // Keep the end of the output, where the actual errors are.
    const output = `${error.stdout ?? ""}${error.stderr ?? ""}`.trim().split("\n").slice(-40).join("\n");
    console.error(`Commit blocked: \`npm run ${script}\` failed. Fix these errors, then commit again.\n\n${output}`);
    process.exit(2);
  }
}
