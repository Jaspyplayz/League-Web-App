# 0008: Claude Code merges its own tiny and normal PRs through one gated command

Status: draft, waiting on Jasper's "In my words" (issue #158). Amended by [0009](0009-can-merge-covers-database-code-and-tiny-code.md).

## Context

Every PR waited for Jasper to merge it, so a fix that had passed every check could sit for hours before players got it. On 2026-10-24, after the Poteto livestream, Jasper chose to let agents merge the two-way doors, the changes that are cheap to undo, and to review what landed afterwards. On 2026-10-25 he said he writes "My read" when he wants to, so it stops being a merge gate.

This loosens a check: "Jasper merges every PR" was the last step before Vercel deployed a change to players. So the new path has to refuse anything risky, and stop on its own if a merge it made turns out wrong.

## Options considered

- **Keep Jasper merging every PR.** Safest. Every change waits on him, including docs and copy fixes.
- **GitHub's auto-merge.** It merges when the required checks pass, with no Claude session watching. GitHub's ruleset requires only `check` and `Vercel`, so it can't see the tier, the builder, the risky paths, the smoke test or the reviewer's verdict without more workflows. The issue rules it out.
- **One gated command Claude runs (chosen).** `npm run can-merge -- <pr>` checks everything at the PR's head commit and prints each gate. With `--merge` it merges that commit and nothing else.
- **A GitHub Action that merges.** A workflow on `main` would run main's gate code and merge with its own token, so the agent never holds merge rights and can't get around the gates. It is the stronger option, left out for now. It needs a new workflow and a token that can merge.
- **A label to remember Claude's merges.** The first draft found Claude's merges by a `merged-by-claude` label. Anyone with access can add or remove a label, so a security review moved the record into the merge commit's message, which changes only through a merge.

## Decision

`npm run can-merge -- <pr> [--merge]` (`scripts/can-merge.ts`, gates in `scripts/can-merge-gates.ts`). Claude runs it from an up-to-date main checkout. Every gate runs, and the command exits with an error if any fails:

1. The gate code in the folder matches `origin/main`.
2. Agent merging is on: `.claude/agent-merge.json` on `origin/main` says `{ "enabledSince": "YYYY-MM-DD" }`, a date that isn't in the future. A missing file or `null` is off.
3. No merge marked as Claude's, or commit it brought in, was reverted on main since `enabledSince`.
4. The PR is open, not a draft, and targets `main`.
5. Claude Code built it: the branch starts with `claude/`, a person opened it from this repo, and the `**Builder:**` line names Claude Code and no other builder.
6. The `**Tier:**` line starts with tiny or normal and names no other tier.
7. No changed path, read from the head commit, is on the risky list in `scripts/risky-paths.ts`.
8. `check` and `smoke` passed in their workflows and `Vercel` passed in a status linking to vercel.com, at the head commit, and no other check failed or is still running.
9. For a normal PR, the Review section says `Reviewer agent at <sha>: no blockers`, and that SHA is the head commit.
10. For a normal PR, every acceptance criterion box is ticked.

`--merge` runs `gh pr merge --merge --match-head-commit <sha>` with "Merged by Claude Code (npm run can-merge)." in the merge commit's message. Then it adds the `merged-by-claude` label and a comment listing each gate.

The switch and the gate code are on the risky list, so only a PR Jasper merges can change them. Claude's deny rules block editing the switch and running `gh pr merge` directly. This PR ships the switch on, dated 2026-10-25, so Jasper merging it is what turns agent merging on.

## Consequences

Good:
- A tiny or normal fix reaches players once its checks and review pass, without waiting for Jasper.
- Each merge leaves a comment with every gate's result, and a marker in main's history.
- Database, sign-in, Riot client, API, Claude spending, models, checks and the merge rules stay Jasper's to merge, whatever the tier says.
- One revert of a Claude merge stops agent merging until Jasper writes a later date.

Bad:
- Jasper no longer reads every PR before it ships, and "My read" may come late or not at all on normal PRs.
- The tier, the builder and the ticked boxes are the PR's own words. A change that should be risky but touches no risky path, such as a new grade shown to players, merges if Claude labels it normal. The reviewer is the check on that.
- `can-merge` stops mistakes, not an agent set on getting around it. `gh` runs with Jasper's credentials, so a Claude that meant to could post a fake `Vercel` status, merge with `gh api` past the deny rules, or run an edited copy of the gate code, which checks itself from the folder it runs in. GitHub's ruleset stays the lock (a pull request, with `check` and `Vercel` passing), and a revert of a Claude merge switches merging off. The GitHub Action above would close this gap.
- `node_modules` isn't checked. A local install that differs from main's lockfile runs main's gate code with different libraries.
- GitHub shows Jasper as the merger, because `gh` runs as him. The label, the comment and the marker show it was Claude.
- Dates are UTC days. After a revert, merging comes back only from a later `enabledSince` date, so a same-day restart has to wait for the next day.
- Jasper still merges from GitHub's website: risky PRs, Dependabot's, and PRs from the Cursor chat or a cloud agent.

## In my words

_(Jasper writes this.)_
