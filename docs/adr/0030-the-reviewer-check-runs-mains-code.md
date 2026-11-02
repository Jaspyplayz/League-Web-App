# 0030: The reviewer check runs main's code, not the PR's

Status: draft (JAS-43). Jasper accepts it by merging its PR, which he merges by hand, since it changes `.github/` and `scripts/can-merge*`. It changes the second Bad consequence of [0010](0010-github-requires-the-reviewer.md) ("It runs the PR's own copy of the workflow and the script") and its line that GitHub doesn't run the check while a PR has a merge conflict; 0010 stays as it was written.

## Context

GitHub's required `reviewer` check ([0010](0010-github-requires-the-reviewer.md)) ran on `pull_request`. For that event GitHub takes the workflow file from the PR, and the job checked out the PR, so the PR's own copy of `scripts/can-merge-reviewer-check.ts`, `scripts/can-merge-gates.ts` and `package.json` decided whether the PR had been reviewed. On throwaway PR 278, a copy of the script that always passes, with no verdict in the description, turned the check green: `PASS Reviewer cleared the PR: probe copy that always passes`.

0010 accepted this because Jasper merged every PR that touched those files. Jasper decided on 2026-11-02 that Claude should merge everything apart from migrations. Once `can-merge` stops refusing gate changes, a PR could rewrite its own required check and merge with nobody noticing, and a green check on a PR Jasper merges by hand would mean nothing.

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

- **Two triggers.** `pull_request_target` runs main's copy of the file, so its run is one no PR can change or outvote. `pull_request` runs the PR's copy. It stays so this PR gets a check of its own, and so the Agent merge workflow still starts when Reviewer finishes on a `claude/` branch ([0024](0024-a-github-action-runs-can-merge.md)), which a `pull_request_target` run may not do, since its run belongs to main. A PR can edit its copy to pass, but that run is a different event, which GitHub keeps apart from main's, as long as main's run lands on the PR's head commit (see Consequences). Each trigger has its own concurrency group, so the two runs for one edit or push don't cancel each other.
- **Main's code only.** The job checks out main with the whole history and no token left in `.git/config`, runs `npm ci` on main's `package.json` with no npm cache (a `pull_request_target` run shares main's cache), and runs main's copy of the script. The token only reads the repo.
- **The PR is only read.** The script still reads the description from the event file GitHub writes, as [0019](0019-merge-gates-read-the-body-as-github-shows-it.md) describes, so the description never reaches a shell. It checks that both commit names in the event are 40 hex characters, so neither can reach git as an option. A fork's commits are on none of main's branches, so the script fetches the head commit by name when the checkout lacks it. Git only stores and diffs the PR's commits; nothing from them runs. No PR title, body or branch name appears in the workflow file, and a test pins that.
- `scripts/can-merge-reviewer-check.test.ts` pins both triggers, every step and checkout option, the one line that reads the event, and the read-only permission, so a change to any of them must change the test too.

## Consequences

- A PR that edits the script, the gates, `package.json` or the workflow is judged by main's copy. A PR that changes the verdict rules is judged by the old rules until it merges.
- Each edit and push starts two `reviewer` runs, one per trigger, and both show on the PR. GitHub's ruleset needs both to pass. For a PR that doesn't touch the workflow they run the same code on the same description, so they agree. `can-merge`'s "Checks pass" gate keeps the newest run per workflow and job name ([0024](0024-a-github-action-runs-can-merge.md)), so it may read only one of the two; it computes the reviewer gate itself from main's code anyway.
- The check still reads text, so anyone who can edit the description can type a verdict line, the bar [0010](0010-github-requires-the-reviewer.md) accepted. What changed is that the code reading it is main's.
- The probes covered other workflows and the `pull_request_review` event. That `pull_request_target` runs are kept apart the same way is inferred, since that trigger can't run before this PR merges.
- The `pull_request_target` run also runs while a PR has a merge conflict, which the `pull_request` one doesn't. `docs/workflow.md` step 11 still says GitHub doesn't run the check then; an open PR edits that file, so it's fixed after that PR merges.
- The npm install takes about half a minute longer without the cache.
- GitHub's Re-run button still reads the description from the run's first start ([0010](0010-github-requires-the-reviewer.md)), but now with main's code at the time of the re-run.
- Not yet seen, because a `pull_request_target` workflow first runs once this PR merges: the new run's check landing on each PR's head commit (GitHub's docs list `pull_request_target` among the events whose checks count for a PR), and which branch it names when it finishes. If it never landed on the head, the `pull_request` run would still give every PR its check, now from main's script. The first PR after the merge shows both.
- Nothing requires dropping the `pull_request` trigger. Dropping it would halve the runs, but needs those two facts first: without the Agent merge wake-up, a PR marked ready would wait for the sweep, up to 15 minutes.
- Reverting this PR puts back the old workflow and script. Nothing outside the repo changed.
