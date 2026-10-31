// The `reviewer` check that main's ruleset requires (JAS-15). It fails a PR
// until its Review section has a no-blockers verdict on the head commit, or on
// an earlier one with only small changes since (decision record 0017), by the
// same rule as can-merge's "Reviewer cleared the head commit" gate.
// .github/workflows/reviewer.yml runs it. It reads the PR from the event file
// GitHub writes, so the description never passes through a shell.

import { readFileSync } from "node:fs";
import { z } from "zod";
import { changedPaths, reviewHistory } from "./can-merge-files";
import { reviewerCleared } from "./can-merge-gates";

const PullRequestEvent = z.object({
  pull_request: z.object({
    body: z.string().nullable(),
    head: z.object({ sha: z.string() }),
    base: z.object({ sha: z.string() }),
  }),
});

const eventPath = process.env.GITHUB_EVENT_PATH;
if (!eventPath) throw new Error("GITHUB_EVENT_PATH isn't set. GitHub Actions sets it; locally, run npm run can-merge.");

const { pull_request: pr } = PullRequestEvent.parse(JSON.parse(readFileSync(eventPath, "utf8")));
const gate = reviewerCleared(
  {
    body: pr.body ?? "",
    headRefOid: pr.head.sha,
    files: changedPaths(pr.base.sha, pr.head.sha),
  },
  reviewHistory(pr.base.sha, pr.head.sha),
);
console.log(`${gate.pass ? "PASS" : "FAIL"} ${gate.name}: ${gate.detail}`);
if (!gate.pass) process.exitCode = 1;
