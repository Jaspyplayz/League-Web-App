# A new way to start a check that the merge gates trust

A change adds a way to start a workflow (a trigger, a dispatch, a button) for one purpose, without asking what else reads the check runs it makes. The merge gates and GitHub's ruleset read a PR's newest run of each check, so a run started another way can stand in for the PR's own.

## 2026-10-31

- **What happened:** for JAS-123 the builder added `workflow_dispatch:` to `ci.yml` so the Agent merge workflow could start CI on main. That also let anyone with write access start CI on a `claude/` branch, a run that tests the branch without main's newer commits. It would become the PR's newest `check`, which can-merge's "Checks pass" gate reads, so a PR whose real CI failed could merge. The trigger should have been allowed only on main.
- **Evidence:** the reviewer's blocker on [PR 243](https://github.com/Jaspyplayz/League-Web-App/pull/243) at 5d325cd: "the new `workflow_dispatch:` trigger lets a CI run on a branch pass can-merge's 'Checks pass' gate even when the PR's real CI failed". It ran `toChecks` (`scripts/can-merge-rest.ts:93`) on a failed `check` at 10:00 and a passing one at 10:30, and got `state: "success"`.
- **Root cause:** the builder thought only about the one caller it was adding (the Action, which always sends `ref=main`) and checked that the new run couldn't loop back into Agent merge. It didn't trace what reads the check runs: `toChecks` keeps the newest run per workflow and job name and never looks at the event. Nothing in the tests pinned `ci.yml`'s triggers or who may start it.
- **Rung:** check
- **Fix:** [PR 243](https://github.com/Jaspyplayz/League-Web-App/pull/243), commit 5a0d423: `ci.yml`'s first step fails a `workflow_dispatch` run anywhere but main. Test `fails at once when started by hand anywhere but main` in `scripts/can-merge-action-steps.test.ts` pins it; with 5d325cd's `ci.yml` put back, it fails (1 failed, 32 passed), and on the fix all 33 pass.
