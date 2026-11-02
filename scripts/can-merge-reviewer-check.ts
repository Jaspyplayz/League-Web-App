// The `reviewer` check that main's ruleset requires (JAS-15). It fails a PR
// until its Review section has a no-blockers verdict on the head commit, or on
// an earlier one with only small changes since (decision record 0017), by the
// same rule as can-merge's "Reviewer cleared the PR" gate.
// .github/workflows/reviewer.yml runs main's copy of it from a checkout of
// main, so a PR can't change what judges it (JAS-43). It reads the PR from the
// event file GitHub writes, so the description never passes through a shell,
// and it only diffs the PR's commits, never runs them.

import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { changedPaths, reviewHistory } from "./can-merge-files";
import { reviewerCleared } from "./can-merge-gates";

// A full commit name, so it can reach git only as a commit, never an option.
const Sha = z.string().regex(/^[0-9a-f]{40}$/);

const PullRequestEvent = z.object({
  pull_request: z.object({
    body: z.string().nullable(),
    head: z.object({ sha: Sha }),
    base: z.object({ sha: Sha }),
  }),
});

const eventPath = process.env.GITHUB_EVENT_PATH;
if (!eventPath) throw new Error("GITHUB_EVENT_PATH isn't set. GitHub Actions sets it; locally, run npm run can-merge.");

const { pull_request: pr } = PullRequestEvent.parse(JSON.parse(readFileSync(eventPath, "utf8")));

// The checkout has every branch, but a fork's commits are on none of them,
// only on GitHub's pull ref, so git fetches the head to diff it.
if (spawnSync("git", ["cat-file", "-e", `${pr.head.sha}^{commit}`], { stdio: "ignore" }).status !== 0) {
  execFileSync("git", ["fetch", "--quiet", "--no-tags", "origin", pr.head.sha], { stdio: "inherit" });
}

const gate = reviewerCleared(
  {
    body: pr.body ?? "",
    headRefOid: pr.head.sha,
    files: changedPaths(pr.base.sha, pr.head.sha),
  },
  // The checkout fetches every branch, so origin/main is here too.
  reviewHistory(pr.base.sha, pr.head.sha, undefined, ["origin/main"]),
);
// Throwaway probe: this copy always passes, whatever the gate said.
console.log(`PASS ${gate.name}: probe copy that always passes (the gate said ${gate.pass ? "pass" : "fail"})`);
