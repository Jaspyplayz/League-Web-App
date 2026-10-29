**Tier:** tiny, normal or risky, and why.
**Builder:** Claude Code on Opus 5.5, in a local or cloud session.
Closes #

## Summary
What changed and why, in plain words for someone new to the codebase, using
the words in `GLOSSARY.md`. Add the smallest picture that shows it: a diagram,
a short diff sketch or a file tree. End with how to try it on the preview.

## Evidence
**Before:** what happened without this change (a screenshot, output or steps).

**After:** what happens now, shown the same way.

## Acceptance criteria
- [ ] Criterion: screenshot or test name

## Tested
Each command you ran and its result, such as `npm test`: `Tests <n> passed`.
A test count must not fall; if tests were removed, say which and why.

## Not tested
What you didn't run or couldn't check, in plain words, or "nothing".

## Merge Danger
**Door:** one-way or two-way. Two-way means a revert undoes it completely;
one-way means something stays changed after a revert (saved data, a
migration, a message sent, a setting).

**Blast radius:** low, medium or high, then what could break and for whom if
this is wrong. Name the page, command or file, not "some players".

## Review
The reviewer's first line, `Reviewer agent at <sha>: no blockers`, then its
findings, each fixed (with the test that shows it) or rejected (with the
evidence). Risky PRs: the pstack `interrogate` panel too, starting
`Interrogate panel at <sha>: <n> to act on`, or "no interrogate panel yet" if
it couldn't run. Any other check gets its own line too, such as `Security check at <sha>: no findings`. Keep each review's findings
under its line, and use that `<name> at <sha>:` shape only for reviews.

## Docs and decisions touched
The docs/ or docs/adr/ files this changes, or "none".
