# Automation that merges before the builder is done

A change lets something merge on its own as soon as the gates pass, but the gates never asked whether the builder had finished. Steps that used to come before the merge, such as screenshots or a postmortem entry, then come after it or not at all.

## 2026-10-31

- **What happened:** the first version of the Agent merge workflow (JAS-121) ran `can-merge --merge` whenever a check finished, so a tiny PR could merge before its builder took the step 7 screenshots, and a normal PR the moment its verdict was pasted, before its postmortem entry. It should have waited for the builder to say it was done.
- **Evidence:** the reviewer on [PR 240](https://github.com/Jaspyplayz/League-Web-App/pull/240), at cf65cb6, blocker 1; two interrogate panel reviewers raised the same gap for the wellness routine's PR.
- **Root cause:** the builder treated "every gate passes" as "the PR is finished", because a person running can-merge used to be the last step. Nothing in the gates (`scripts/can-merge-gates.ts`) records that the builder's own steps are done.
- **Rung:** design
- **Fix:** [PR 240](https://github.com/Jaspyplayz/League-Web-App/pull/240): the workflow merges only a PR whose description says `**Ready to merge:** yes at <head sha>`, which the PR template opens as no, so a push after it holds the PR again; tests `holds a PR that says no, says nothing, has no body, or adds a condition`, `holds the PR again after a push, until the builder names the new head` and `is the only way the script picks a PR, and it runs can-merge only on those` in `scripts/can-merge-action-steps.test.ts`.
