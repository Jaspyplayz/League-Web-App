# Automation that merges before the builder is done

A change lets something merge on its own as soon as the gates pass, but the gates never asked whether the builder had finished. Steps that used to come before the merge, such as screenshots or a postmortem entry, then come after it or not at all.

## 2026-10-31

- **What happened:** the first version of the Agent merge workflow (JAS-121) ran `can-merge --merge` whenever a check finished, so a tiny PR could merge before its builder took the step 7 screenshots, and a normal PR the moment its verdict was pasted, before its postmortem entry. It should have waited for the builder to say it was done.
- **Evidence:** the reviewer on [PR 240](https://github.com/Jaspyplayz/League-Web-App/pull/240), at cf65cb6, blocker 1; two interrogate panel reviewers raised the same gap for the wellness routine's PR.
- **Root cause:** the builder treated "every gate passes" as "the PR is finished", because a person running can-merge used to be the last step. Nothing in the gates (`scripts/can-merge-gates.ts`) records that the builder's own steps are done.
- **Rung:** design
- **Fix:** [PR 240](https://github.com/Jaspyplayz/League-Web-App/pull/240): the workflow merges only a PR whose description says `**Ready to merge:** yes`, which the PR template opens as no; tests `holds a PR that says no, says nothing, or has no body` and `holds a PR whose yes is hidden or doubled, like the other fields` in `scripts/can-merge-action-steps.test.ts`.
