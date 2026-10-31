# 0024: A GitHub Action runs can-merge when a PR's checks finish

Status: draft (JAS-121). Jasper accepts it by merging the PR. It takes up the option [0008](0008-agents-merge-two-way-doors.md) left out ("A GitHub Action that merges"); 0008 stays as it was written.

## Context

`npm run can-merge -- <pr> --merge` ([0008](0008-agents-merge-two-way-doors.md), [0013](0013-can-merge-uses-github-rest.md)) is the only way Claude Code merges its own PRs, and something has to run it once every check has finished. On 2026-10-31 nothing did: PRs 234, 235 and 238 each waited for Jasper or a local session. The cloud's permission check refused `can-merge --merge` as "an unrequested commit in a connected app" (PR 234), and a builder that has finished can't wait around for the last check anyway. A watcher script on Jasper's PC would only work while it's on. Jasper chose a GitHub Action.

## Options considered

1. **A watcher on Jasper's PC** that polls open Claude PRs. Nothing new in `.github/`, but nothing merges while his PC is off.
2. **GitHub's auto-merge.** It sees only the required checks, not the tier, the builder, the risky list or the ticked criteria. 0008 ruled it out for that.
3. **A workflow that runs `can-merge --merge` from main when a check finishes (chosen).** The gates stay in one place and run unchanged.

## Decision

Option 3: `.github/workflows/agent-merge.yml`, with `scripts/can-merge-action.ts` and its pure, tested decisions in `scripts/can-merge-action-steps.ts`.

- **When:** `workflow_run`, `completed`, on CI, Reviewer, Smoke test and Dependency review: every workflow that puts a check on a PR. The job runs only for a successful run on a branch that starts `claude/` in this repo; anything else never starts a runner. The script checks the branch and repo again so it's safe on its own.
- **Which PR:** the open PR whose head is that branch in this repo (`GET pulls?state=open&head=<owner>:<branch>`). The run's own `pull_requests` list is empty for Smoke test, which starts from a deployment, so the branch is the one key every run has.
- **What runs:** `npm ci`, then `can-merge --merge` on the PR, from main. A `workflow_run` workflow always runs as it is on main, and the job checks out main with `persist-credentials: false`. The PR's code is never checked out or run; can-merge only reads it through `git fetch` and the REST API. A test reads the workflow file and fails if a checkout ever names anything but main, or the token reaches any step but the last. The job skips the npm cache, since PR runs fill caches too.
- **Refusal versus crash:** can-merge now exits with 2 when a gate fails (`REFUSED_EXIT_CODE` in `scripts/can-merge-gates.ts`) and 1 on any error, Node's code for an uncaught one. A refusal is the usual result, since most checks finish while another is still running, so it passes with a notice and a line in the run's summary. A crash, including a merge whose comment or label then fails, turns the run red. The gates themselves didn't change.
- **Races:** a concurrency group per branch runs one at a time, and a newer run waits rather than cancel one that might be mid-merge. The merge request names the head commit the gates checked, so GitHub refuses it if the PR moved.
- **Token:** the job's built-in `GITHUB_TOKEN`, with `contents`, `pull-requests` and `issues` write and nothing else.

## The three open questions

1. **Token.** GitHub doesn't start workflows for events the built-in token causes, apart from `workflow_dispatch`, `repository_dispatch` and some `pull_request` events ([GitHub docs: GITHUB_TOKEN](https://docs.github.com/en/actions/concepts/security/github_token)). So the merge commit this workflow pushes to main gets no `CI` push run. The PR's own CI already passed at its head commit, the ruleset doesn't ask for a branch to be up to date before merging, and Vercel deploys main through its own app, not a workflow, so production still deploys. What's lost is the after-merge CI run on main for these merges; the next push to main runs it on everything. A GitHub App token would keep that run and show the app as the merger, but Jasper would have to create the app, install it and add two secrets, and the workflow would need `actions/create-github-app-token`, a new dependency. Built with `GITHUB_TOKEN`; switching later changes one step.
2. **Ruleset.** Main's "Protect Main Branch" ruleset has `require_extra_approval_for_unattributed_changes` on. GitHub's docs describe it as one more approval for a PR Copilot opens that isn't attributed to a person, and say it has no effect when the ruleset requires zero approvals ([GitHub docs: available rules for rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets)). The ruleset requires 0 approvals (`gh api repos/Jaspyplayz/League-Web-App/rulesets/25086024`), and Claude's PRs are opened by Jasper's account, not Copilot. So it shouldn't block `github-actions[bot]`. The ruleset has no bypass actors, so the bot's merge passes the same `check`, `Vercel` and `reviewer` checks a person's does. Unchanged.
3. **Vercel check.** Vercel's status comes from its app and starts no workflow run. The smoke test starts from Vercel's "deployment succeeded" event and takes one to two minutes, so Vercel's status is in before it finishes. On the 40 most recent Claude PRs (up to #239), Vercel's status was set before the smoke test finished on every one. CodeQL's checks also start no workflow this can name, but on the same 40 PRs CodeQL never finished after the last of the four workflows.

## Consequences

- A cloud builder's tiny or normal PR merges once its last check passes, with no Claude session open. The merge comment and the `merged-by-claude` label are added as before, and the merge commit carries the same marker the revert gate reads.
- GitHub shows `github-actions[bot]` as the merger instead of Jasper.
- The agent no longer needs merge rights to finish a PR, which closes part of the gap 0008 named: the Action runs main's gate code, not a copy in the builder's folder. Jasper's credentials in a session can still merge, so the ruleset stays the lock.
- A PR whose gates pass only after an edit that reruns no workflow, such as a label change, sits until the next check finishes or a session runs can-merge. Ticking a box or adding a verdict edits the description, which reruns Reviewer.
- If CodeQL or a new app's check is ever the last to finish, the PR waits for the next run. The fix then is to name that workflow in the trigger list.
- More Actions minutes: up to four short runs per push to a Claude branch, each `npm ci` plus can-merge. The repo is public, so they're free.
- It runs for the first time once this PR merges, since `workflow_run` runs only from the default branch.
- Reverting this PR stops the Action, and `npm run can-merge` works from a session as before.

## In my words

_(Jasper writes this.)_
