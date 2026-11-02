# 0032: The reviewer check runs main's code, not the PR's

Status: draft (JAS-43). Jasper accepts it by merging its PR, which he merges by hand, since it changes `.github/` and `scripts/can-merge*`. It changes the second Bad consequence of [0010](0010-github-requires-the-reviewer.md) ("It runs the PR's own copy of the workflow and the script"), 0010's line that GitHub doesn't run the check while a PR has a merge conflict, and its line that `can-merge` counts only the latest run of each check; 0010 stays as it was written.

## Context

GitHub's required `reviewer` check ([0010](0010-github-requires-the-reviewer.md)) ran on `pull_request`. For that event GitHub takes the workflow file from the PR, and the job checked out the PR, so the PR's own copy of `scripts/can-merge-reviewer-check.ts`, `scripts/can-merge-gates.ts` and `package.json` decided whether the PR had been reviewed. On throwaway PR 278, a copy of the script that always passes, with no verdict in the description, turned the check green: `PASS Reviewer cleared the PR: probe copy that always passes`.

0010 accepted this because Jasper merged every PR that touched those files. On 2026-11-02 Jasper decided that Claude should merge everything apart from migrations, and a later change will let `can-merge` merge PRs that change gate code. Once it does, a PR could rewrite its own required check and merge with nobody noticing. Even today, a green check on a PR Jasper merges by hand means nothing if the PR wrote the check.

The ruleset ("Protect Main Branch") requires a check named `reviewer` from the GitHub Actions app, from any workflow. PR 278 also tested what GitHub does when more than one workflow reports a `reviewer` check on the same commit:

- With the real check failing and two other workflows' `reviewer` jobs passing, one before it and one after, the PR stayed blocked while `check` and `Vercel` passed. After a verdict went into the description and the real check passed too, it turned clean, so a newer run of the same workflow replaces an older one.
- Those three runs started in the same second, so a third commit added a `reviewer` job that started three minutes after the real check failed. The PR stayed blocked.
- A fourth commit added one workflow whose `reviewer` job failed on `pull_request` and passed on `pull_request_review`. With the real check passing, a comment review started the passing run, and the PR stayed blocked.

So GitHub keeps the newest `reviewer` run of each workflow and event apart, and the ruleset needs every one of them to pass. A job with the same name elsewhere, or a later run from another event, can't outvote a failing one.

## Options considered

1. **Keep `pull_request`, and run main's script from a checkout of main** (the ticket's first suggestion). Closes edits to the script, the gates and the packages. The PR's copy of the workflow still decides what runs, so a PR that edits `reviewer.yml` can still pass.
2. **`pull_request_target` alone.** GitHub runs this event from main's copy of the workflow, so a PR can change nothing about the check. But GitHub reads a `pull_request_target` workflow only from main, and main's copy has no such trigger until this PR merges. This PR would get no `reviewer` check at all, and Jasper couldn't merge it without changing the ruleset.
3. **Both triggers, both running main's code (chosen).**

## Decision

Option 3, in `.github/workflows/reviewer.yml`:

- **Two triggers.** `pull_request_target` runs main's copy of the file, so no PR can change that run. In the probes above, a passing job in another workflow or a later run from another event couldn't outvote a failing run, so a PR can't outvote main's run that way either, as long as its check lands on the PR's head commit (inferred for this event; see Consequences). `pull_request` runs the PR's copy, which a PR can edit to pass. It's there because this PR needed a check of its own. Each trigger has its own concurrency group, so the two runs for one edit or push don't cancel each other.
- **Main's code only.** Main's copy of the job checks out main with the whole history and no token left in `.git/config`, runs `npm ci` on main's `package.json` with no npm cache (a `pull_request_target` run would read and write main's cache), and runs main's copy of the script. Its token only reads the repo, and it stops after 10 minutes. A PR's copy, on `pull_request`, can change all of that for its own run.
- **The PR is only read.** The script still reads the description from the event file GitHub writes, as [0019](0019-merge-gates-read-the-body-as-github-shows-it.md) describes, so the description never reaches a shell. It checks that both commit names in the event are 40 hex characters, so neither can reach git as an option. A fork's commits are on none of main's branches, so the script fetches the head commit by name when the checkout lacks it (tested against a local clone, not GitHub's pull refs). Git only stores and diffs the PR's commits; nothing from them runs. No PR title, body or branch name appears in the workflow file.
- **`can-merge` counts runs the way GitHub does.** `toChecks` in `scripts/can-merge-rest.ts` keeps the newest run of each workflow, event and job name. Before, it ignored the event, so a newer passing run from the PR's copy could hide a failed or pending run from main's, and `can-merge` would try a merge GitHub refuses. This is the same blind spot as [the trigger mistake of 2026-10-31](../agent-mistakes/new-trigger-feeds-the-gates.md).
- Tests pin both triggers, every line of the job, the one line that reads the event, the read-only permission, commit names that look like options (without the hex check, one makes git write the diff to a file so a tiny PR passes, and one makes git run a command), and the per-event counting, so a change to any of them must change a test too.

## Consequences

- A PR that edits the script, the gates or `package.json` is judged by main's copy in both runs. A PR that edits the workflow is judged by main's copy in the `pull_request_target` run. A PR that changes the verdict rules is judged by the old rules until it merges.
- Each edit and push starts two `reviewer` runs, one per trigger, and both show on the PR. GitHub's ruleset needs both to pass. For a PR that doesn't touch the workflow they run the same code on the same description, so they agree. A failure shows twice, so the failure notices 0010 lists come twice too.
- Each finished Reviewer run starts the Agent merge workflow ([0024](0024-a-github-action-runs-can-merge.md)) if it names a `claude/` branch in this repo, so a push may start one more Agent merge run, or one more skipped run. The builder's last edit, the Ready line, now starts two Reviewer runs. If main's finishes second and doesn't start Agent merge (item 3 below), `can-merge` refuses while it's still running, and the PR waits for the sweep, up to 15 minutes.
- Because `can-merge` now keeps each event's runs apart, a failed CI run started by hand on a PR's branch (`ci.yml` fails those on purpose) holds that head commit until the next push, since a later `pull_request` CI run no longer replaces it. GitHub's page (cited below) doesn't list `workflow_dispatch` among the events whose checks count for a PR, so here `can-merge` is stricter than GitHub, which fails closed. The reason `ci.yml`'s comment gives for that guard, that such a run would become the PR's newest `check`, no longer holds for `can-merge`.
- The check still reads text, so anyone who can edit the description can type a verdict line, the bar [0010](0010-github-requires-the-reviewer.md) accepted. What changed is that the code reading it is main's.
- A branch in this repo can still run its own code with a write token on `pull_request`, in its copy of this file or in a workflow it adds. Such a run might post a `reviewer` check through the Checks API, change main's, or cancel or delete main's run. None of that was probed. So for a PR from a branch here that changes `.github/`, what guards the check is who can push to the repo and Jasper reading the diff, as with Agent merge ([0024](0024-a-github-action-runs-can-merge.md)). A fork's `pull_request` run gets a read-only token, so it can't do those.
- Concurrency groups are shared across the repo, and any PR's workflow, a fork's included, can name main's group. Joining it cancels main's running run, which then counts as failed and blocks merging. A run cancelled while it waits to start might leave no check run at all, which would leave only the PR's own; that wasn't probed either.
- A fork's PR starts the `pull_request_target` run without the approval GitHub asks for before a fork's `pull_request` runs. The run is main's code with a read-only token, and the timeout caps it.
- If the repo went private, the script's fetch of a fork's head would need a token it doesn't have, and the check would fail for forks' PRs.
- The `pull_request_target` run also runs while a PR has a merge conflict, which the `pull_request` one doesn't. `docs/workflow.md` step 11 says so now, and says a PR marked ready may wait for the sweep.
- The npm install takes about half a minute longer without the cache.
- GitHub's Re-run button still reads the description from the run's first start ([0010](0010-github-requires-the-reviewer.md)), but now with main's code at the time of the re-run.
- If main's copy of the script breaks, every PR fails the check, including the PR that fixes it, since that PR is judged by main's broken copy too. The way out is 0010's: Jasper removes `reviewer` from the ruleset's required checks for that one merge.
- **Still to see after this merges**, since a `pull_request_target` workflow first runs then:
  1. A second `reviewer` run lands on the PR's head commit. GitHub lists `pull_request_target` among the events whose workflow checks count for a PR ([troubleshooting required status checks](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks)), but doesn't say which commit the check lands on. If it never landed, a PR that edits `reviewer.yml` could pass again, as before this change; edits to the script and gates would still be caught.
  2. A throwaway PR whose copy of `reviewer.yml` simply passes, with no verdict, stays blocked. The probes showed GitHub keeps other workflows and the `pull_request_review` event apart; for `pull_request_target` it's inferred.
  3. Which branch the run names when it finishes, which decides whether it starts Agent merge.
  4. Whether a run cancelled while it waits to start leaves a `reviewer` check run. If not, main's run needs a concurrency group no other workflow can name.
- Once those are seen, the `pull_request` trigger can go: every PR would then get only main's copy, and runs halve. If the `pull_request_target` run doesn't start Agent merge, dropping it means a PR marked ready waits for the sweep, up to 15 minutes.
- Reverting this PR puts back the old workflow and script. Nothing outside the repo changed.
