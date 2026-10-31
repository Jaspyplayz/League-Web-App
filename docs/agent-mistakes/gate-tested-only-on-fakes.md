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

## 2026-10-31

- **What happened:** the first version of the JAS-58 fix made a verdict count only when it starts its line, and skipped any other verdict-like line, so "- Reviewer agent at <head>: 1 blockers" under an older clean verdict let the clean one carry over. It should have failed: a line it can't read is never safe to skip.
- **Evidence:** the reviewer on [PR 223](https://github.com/Jaspyplayz/League-Web-App/pull/223), at 296118d, blocker 1: main fails that body with "blockers in the newest verdict", the branch passed it with "no blockers, carried over 1 commit with 5 lines outside docs". The Sonnet and Haiku panel reviewers found the same.
- **Root cause:** the builder tested each new shape on its own, with one verdict per body, and never put a skipped line next to a verdict that could carry over.
- **Rung:** check
- **Fix:** [PR 223](https://github.com/Jaspyplayz/League-Web-App/pull/223): any verdict-like line the gate can't read fails it, and the test `refuses blockers after a bullet even when an older clean verdict would carry over` fails on 296118d's gate code.

## 2026-10-31

- **What happened:** the first version of the JAS-58 fix taught the line reader to skip fenced code blocks and HTML comments, and passed its tests, but more than ten bodies the reviewer and the panel built still passed with a fake Review section GitHub shows as code or hides, such as a fence on a list item. It should have failed closed where the reader and GitHub can disagree.
- **Evidence:** the reviewer on [PR 223](https://github.com/Jaspyplayz/League-Web-App/pull/223), at 296118d, blocker 2 ("listMarkerFence PASS"), and all three panel reviewers' probes, each listed in decision record 0019.
- **Root cause:** the builder treated matching GitHub's Markdown as reachable with a few rules, and wrote tests for the shapes those rules handled instead of for the ways a reader that disagrees with GitHub could be fooled.
- **Rung:** design
- **Fix:** [PR 223](https://github.com/Jaspyplayz/League-Web-App/pull/223): a second line that could be the same heading or field fails the gate, so a disagreement over which one GitHub shows can't pass. The test `refuses a fake Review section behind %s` holds each body, and 27 tests fail on 296118d's gate code.

## 2026-10-31

- **What happened:** the fail-closed JAS-58 fix let a section end at a `#` heading indented up to 3 spaces, so a shell comment such as "  # run it" in a list item's code block ended the Review or Acceptance criteria section, and a blockers verdict or unticked box after it was dropped. It should have kept looking for failing lines past where it thinks the section ends.
- **Evidence:** the reviewer's re-review on [PR 223](https://github.com/Jaspyplayz/League-Web-App/pull/223), at e8adedb, blocker 1: main fails that body with "blockers in the newest verdict", e8adedb passed it with "no blockers, carried over 1 commit with 5 lines outside docs".
- **Root cause:** the builder made failing signals count anywhere inside a section, but trusted the section's end, which is decided by the same reader that can disagree with GitHub.
- **Rung:** check
- **Fix:** [PR 223](https://github.com/Jaspyplayz/League-Web-App/pull/223): the gates also look for unticked boxes and verdict-like lines in the rest of the body, and the tests `counts an unticked box after a # comment in a code block on a %slist item` and `refuses blockers after a # comment in a list item's code block even when an older clean verdict would carry over` fail on e8adedb's gate code.

## 2026-10-31

- **What happened:** the JAS-58 fix treated a Review section the reader couldn't see as no Review section, so a tiny PR whose Summary held a code block after "- " or a `<!--` in a paragraph skipped past "Reviewer agent at <head>: 1 blockers" under a heading GitHub shows. It should have failed: one line that looks like the heading but can't be read is not the same as none.
- **Evidence:** the reviewer's re-review on [PR 223](https://github.com/Jaspyplayz/League-Web-App/pull/223), at f50720e, blocker 1: main fails that body with "blockers in the newest verdict", f50720e passed it with "a tiny PR that changes only docs skips the reviewer".
- **Root cause:** the builder made the gates fail closed on what the reader saw, but kept the old "missing" answer for a heading it couldn't see, and every test of a hidden heading used a normal PR, where missing already fails.
- **Rung:** check
- **Fix:** [PR 223](https://github.com/Jaspyplayz/League-Web-App/pull/223): a heading that looks right in the raw body but isn't seen fails the gate, and the test `reads a blockers verdict on a tiny PR when the heading is hidden from the gate by %s` fails on f50720e's gate code.
