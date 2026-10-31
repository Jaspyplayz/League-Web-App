# Description quotes a field line

`npm run can-merge` refuses a PR whose description has more than one line starting with a field it reads, such as `**Tier:**`, even inside a code block, because it can't promise to pick the line GitHub shows. So an example Tier line in the Summary blocks the merge.

## 2026-10-31

- **What happened:** Claude's first description for PR 241 drew the new rule in a code block of three example lines, each starting with `**Tier:**`. `can-merge` refused the PR for having four Tier lines. The diagram should have shown the examples without the field label, as the edited description does ("Tier line says:  normal: ...").
- **Evidence:** `npm run can-merge -- 241` at 8501f60: "FAIL  Tiny or normal tier: 4 lines start with **Tier:**; keep one". [PR 241](https://github.com/Jaspyplayz/League-Web-App/pull/241).
- **Root cause:** the builder knew the gates fail closed on a second `## ` heading, which the PR template's Summary warns about, but not that `field` in `scripts/can-merge-gates.ts` does the same for a second `**Label:**` line. Nothing warns about it before `can-merge` runs.
- **Rung:** none yet
- **Fix:** none yet, as a first occurrence. If it repeats, the PR template's Summary can warn about field lines next to its warning about `## ` headings.
