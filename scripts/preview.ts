import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { loadEnvConfig } from "@next/env";

function run(command: string, args: string[]): string {
  return execFileSync(command, args, { encoding: "utf8" }).trim();
}

// A worktree has no .env.local of its own, so fall back to the main
// checkout's. Callers use only the preview bypass secret, and never print it.
export function loadEnv() {
  const here = process.cwd();
  const main = dirname(resolve(here, run("git", ["rev-parse", "--git-common-dir"])));
  loadEnvConfig(existsSync(join(here, ".env.local")) ? here : main);
}

// Vercel reports each commit's preview to GitHub as a deployment, which is
// also how the smoke test finds it (.github/workflows/smoke.yml). Only
// Vercel's own entries are trusted, since the bypass secret goes to the URL
// they name.
export function previewUrl(pr: string): string {
  const sha = run("gh", ["pr", "view", pr, "--json", "headRefOid", "--jq", ".headRefOid"]);
  const statuses = run("gh", [
    "api",
    `repos/{owner}/{repo}/deployments?sha=${sha}&environment=Preview`,
    "--jq",
    '[.[] | select(.creator.login == "vercel[bot]")][0].statuses_url // empty',
  ]);
  const url =
    statuses &&
    run("gh", [
      "api",
      statuses,
      "--jq",
      '[.[] | select(.state == "success" and .creator.login == "vercel[bot]")][0].environment_url // empty',
    ]);
  if (!url) {
    throw new Error(`PR #${pr}'s latest commit has no finished Vercel preview yet. Wait for the Vercel check.`);
  }
  return url;
}
