// The files a PR changes, as the "No risky files" gate in
// scripts/can-merge-gates.ts sees them. scripts/can-merge.ts calls this.

import { execFileSync } from "node:child_process";

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
