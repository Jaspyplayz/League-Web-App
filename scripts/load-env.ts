import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { loadEnvConfig } from "@next/env";

// A worktree has no .env.local of its own, so fall back to the main
// checkout's. Callers use only the preview bypass secret, and never print it.
export function loadEnv() {
  const here = process.cwd();
  const common = execFileSync("git", ["rev-parse", "--git-common-dir"], { encoding: "utf8" }).trim();
  loadEnvConfig(existsSync(join(here, ".env.local")) ? here : dirname(resolve(here, common)));
}
