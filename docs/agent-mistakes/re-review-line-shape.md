# Re-review line written in the wrong shape

The `reviewer` check reads the reviewer's verdict line in a PR's Review section. A line in another shape doesn't count, so the check fails as if the reviewer never saw the head commit.

## 2026-10-29

- **What happened:** Claude wrote both re-review lines on PR 209 with the suffix before the colon: `Reviewer agent at <sha> (re-review since <since>): no blockers`. The `reviewer` check skipped them and failed, naming only the older commits.
- **Evidence:** [PR 209](https://github.com/Jaspyplayz/League-Web-App/pull/209): "the reviewer saw ceee3d8, d394753, not the head commit 3b48be1".
- **Root cause:** `reviewer.md` said the suffix goes "after it", which reads as after the commit as easily as after the verdict, and the check's message never named the line it couldn't read.
- **Rung:** check
- **Fix:** [PR 210](https://github.com/Jaspyplayz/League-Web-App/pull/210) (JAS-59): the gate's failure names any line that names a commit but isn't a verdict, and the shape it reads (`scripts/can-merge-gates.ts`, test `names a verdict line it can't read`); `reviewer.md` shows the whole re-review line.
