# 0013: can-merge and preview lookups read GitHub through its REST API

Status: draft, waiting on Jasper's "In my words" (Linear JAS-26). It changes how `npm run can-merge` reads a PR and merges it, which [0008](0008-agents-merge-two-way-doors.md) describes with `gh pr view` and `gh pr merge`. 0008 stays as it was written.

## Context

GitHub has two APIs. GraphQL lets a client ask for exactly the fields it wants in one request; REST has one address per kind of thing, such as `repos/{owner}/{repo}/pulls/195` for a PR. `gh pr view` and `gh pr merge` use GraphQL. `gh api <path>` sends a REST request.

[0012](0012-claude-only-workflow.md) makes cloud sessions builders. A cloud check on 2026-10-28 found that a cloud session's GitHub proxy refuses GraphQL: `gh pr view` failed with `HTTP 403: GitHub GraphQL is not available from Claude Code sessions`, while `gh api` worked. `scripts/can-merge.ts` started with `gh pr view`, and `scripts/preview.ts`, which finds a PR's Vercel preview for `npm run shot -- --pr`, did too. So a cloud builder could run neither.

The hard part is the `check` and `smoke` gates. They count only when they come from their own workflows (CI and Smoke test), so a job with the same name in another workflow can't pass for them. GraphQL names each check run's workflow. REST doesn't: a check run only says which check suite it belongs to.

## Options considered

1. **Keep GraphQL and wait for the proxy to allow it.** Nothing to build, but cloud builders stay unable to merge or take screenshots, and there is no date for a change.
2. **Send GraphQL queries through `gh api graphql`.** The proxy refuses GraphQL whatever sends it, so this fails the same way.
3. **Read everything through REST, and match each check run to its workflow run by check suite.** Every workflow run has its own check suite, and a re-run attempt keeps the same one (checked on the repo's only three re-runs, Smoke test runs 40187991747, 38945272388 and 38843602077, on earlier commits of #169, #89 and #86). A check run whose suite has no workflow run, such as CodeQL's, gets no workflow name, which is what GraphQL gave too.

## Decision

Option 3.

- `scripts/can-merge-rest.ts` holds one pure function, `toPrSnapshot`, that turns four REST answers into the `PrSnapshot` the gates already check: the PR (`GET pulls/{n}`), every check run at the head commit (`GET commits/{sha}/check-runs?filter=all`), the workflow runs at that commit (`GET actions/runs?head_sha={sha}`), and the commit statuses, where Vercel's check lives (`GET commits/{sha}/status`). Its tests use REST answers saved in `scripts/can-merge-fixtures/`.
- The "latest run of each check" rule moved there from `scripts/can-merge-gates.ts`, unchanged except for REST's lowercase states. The gates themselves didn't change.
- Each list is read as one page of up to 100 items, and can-merge stops with an error if GitHub says there are more, rather than judging a PR on part of its checks. #195 had 12 check runs.
- `--merge` sends `PUT repos/{owner}/{repo}/pulls/{n}/merge` with `sha` set to the head commit the gates checked and `merge_method: merge`. GitHub refuses it if the PR moved past that commit, which is what `gh pr merge --match-head-commit` did. The subject line and the "Merged by Claude Code (npm run can-merge)." marker are the same as before. The gates comment and the `merged-by-claude` label go through the issue endpoints (`POST issues/{n}/comments` and `POST issues/{n}/labels`). Once GitHub has merged the PR, a failure in the marker check, the comment or the label no longer stops the steps after it: each one says what failed, and the run ends with an error naming what's left to do by hand, since running can-merge again would only find the PR merged.
- can-merge no longer creates the `merged-by-claude` label. It adds the label only if it already exists on GitHub and says so when it doesn't. The marker in the merge commit is the record the revert gate reads, so a missing label changes no gate.
- A new deny rule in `.claude/settings.json`, `Bash(gh api *pulls/*/merge*)`, stops Claude from sending that merge request itself, next to the rule that already blocks `gh pr merge`. `npm run can-merge` still can, because deny rules check the commands Claude types, not the ones a script it runs starts.

## Consequences

- A cloud session can run check-only `npm run can-merge` and `npm run shot -- --pr`. Opening a PR (`gh pr create`) and editing its description still use GraphQL, so a cloud builder still can't open a PR or write its Review section.
- On the 40 most recent PRs (#140 to #195), main's GraphQL code and this REST code print the same gate lines on 37. The other 3 are Dependabot's, where the bot's name is spelled `dependabot[bot]` instead of gh's `app/dependabot`; the gate fails either way.
- A bot is now recognised by GitHub's account type (`Bot`), not gh's `is_bot` flag. A PR from a deleted fork, whose head repository GitHub reports as null, counts as a fork.
- `npm run shot -- --pr` takes only a PR number now, since the number goes into an API path. `gh pr view` also took a branch name or a URL, which no doc or skill used.
- The new deny rule, like the others, catches mistakes and isn't a security boundary. A Claude set on merging could still use `curl`, a GraphQL mutation outside the cloud, or an edited copy of the script, as 0008 says. GitHub's ruleset stays the lock.
- `--merge` runs for real for the first time on the next tiny PR after this one merges, and that run is reported on JAS-26.

## In my words

_(Jasper writes this.)_
