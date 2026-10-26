# 0010: GitHub requires the reviewer's verdict before any PR merges

Status: draft, waiting on Jasper's "In my words" (Linear JAS-15). Amends [0008](0008-agents-merge-two-way-doors.md).

## Context

On 2026-10-25 and 2026-10-26, Jasper merged #170, #178 and #179 before the reviewer agent finished. Each time the reviewer then found problems in the merged code, so each one needed a follow-up PR, the last of them #180. GitHub couldn't stop the early merges. The "Protect Main Branch" ruleset required only `check` and `Vercel`, and the reviewer's verdict lived in the PR description, which GitHub never read. Only `npm run can-merge` read it, and Jasper merges from GitHub's website.

## Options considered

1. Open every PR as a draft until the reviewer finishes. This needs no code, but Jasper can still click "Ready for review" and merge, so it only slows him down.
2. A required check that reads the verdict line in the PR description.
3. A required approving review. GitHub won't let anyone approve their own PR, and the reviewer runs as Jasper's account, so this needs a second account or a GitHub App with its own token.
4. Run the reviewer agent itself in GitHub Actions. This needs a Claude API key in CI and spends Claude money on every push, and nothing would check the agent's own verdict.

## Decision

Option 2:
- `.github/workflows/reviewer.yml` runs `scripts/can-merge-reviewer-check.ts` on every PR into main when it opens, gets a commit, has its description edited, reopens, or leaves draft.
- The script reads the PR from the event file GitHub writes, lists its files with `scripts/can-merge-files.ts`, and runs `reviewerCleared` from `scripts/can-merge-gates.ts`. That is the same function as `can-merge`'s "Reviewer cleared the head commit" gate, so the two read the verdict line the same way. A tiny PR that changes only docs passes without the line.
- Main's ruleset requires the `reviewer` check from GitHub Actions only, so a commit status named `reviewer` doesn't count. Nobody is on the bypass list.
- `can-merge` counts only the latest run of each check, as GitHub's merge box does. Without that, a `reviewer` run that failed before the verdict line went in would block `can-merge` forever.
- On a PR Claude Code didn't build, such as Dependabot's, the Cursor chat's or a cloud agent's, Claude runs the reviewer and adds a `## Review` section with the verdict line to the description.

## Consequences

Good:
- Nobody, Jasper included, can merge a PR before the reviewer clears its head commit. A push after the review fails the check again until a fresh review.
- GitHub and `can-merge` read the verdict line with one function, and both count only the latest run of a check.

Bad:
- The check reads text, so anyone who can edit the description can type the line. It stops early merges by habit, not someone set on getting around it, the same bar as 0008.
- It runs the PR's own copy of the workflow and the script, so a PR can change what it checks. Both are on the risky list, so Jasper merges any PR that touches them.
- Each PR Claude Code didn't build waits until Claude runs the reviewer and edits the description. When Dependabot rebases, it rewrites the description, but it also makes a new head commit, which needs a new review anyway.
- GitHub's Re-run button reads the description from when the first run started, so only an edit to the description runs the check again. GitHub doesn't run it while the PR has a merge conflict.
- Every edit and push starts one more Actions run.
- The Grok second review on risky PRs still isn't enforced.
- In an emergency, Jasper removes `reviewer` from the ruleset's required checks in GitHub's settings.

## In my words

_(Jasper writes this.)_
