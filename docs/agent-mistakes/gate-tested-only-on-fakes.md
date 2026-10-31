# A merge gate tested only on made-up inputs

A gate's tests build its inputs by hand, so they pass for the cases the builder thought of. A case the hand-made inputs never hold, such as a verdict that names a main commit, or a verdict on a PR the gate skips, gets through.

## 2026-10-31

- **What happened:** the first version of the tiny skip in `scripts/can-merge-gates.ts` ran before the gate read any verdict, so a tiny PR under 30 lines passed even with "Reviewer agent at <head>: 1 blockers" in its Review section. It should have read the verdict first.
- **Evidence:** the reviewer on [PR 221](https://github.com/Jaspyplayz/League-Web-App/pull/221), at 9a33530: "a tiny PR that changes 29 lines outside docs (up to 30) skips the reviewer", from the real `reviewerCleared` with a blockers verdict.
- **Root cause:** the builder wrote the skip as an early return, the way docs-only tiny PRs had always skipped, and its tests never put a verdict on a tiny PR.
- **Rung:** check
- **Fix:** [PR 221](https://github.com/Jaspyplayz/League-Web-App/pull/221): the gate reads verdicts first, and the test `reads a blockers verdict on a tiny PR under the limit instead of skipping it` fails if it stops.

## 2026-10-31

- **What happened:** the first version of `reviewHistory` in `scripts/can-merge-files.ts` placed a verdict on any ancestor of the head, so a verdict naming the base commit or any older main commit carried over a PR nobody reviewed. It should have taken only commits the PR added.
- **Evidence:** the reviewer and the Haiku panel reviewer on [PR 221](https://github.com/Jaspyplayz/League-Web-App/pull/221), at 9a33530: "PASS - Reviewer agent at 815b476: no blockers, carried over 1 commits with 35 lines outside docs and tests", with 815b476 the base commit.
- **Root cause:** the gate's tests used a hand-made `since` that only knew the commits the builder named, and no test ran `reviewHistory` on a real repo.
- **Rung:** check
- **Fix:** [PR 221](https://github.com/Jaspyplayz/League-Web-App/pull/221): `since` refuses a commit that main or GitHub's base already has, and the real-repo tests `doesn't place a verdict on the base commit` and `on a main commit merged in` in `scripts/can-merge-files.test.ts`, with `fails a verdict on the base commit` in the reviewer check's tests, fail if it stops.
