# Agent mistakes

Each mistake an agent made that a check could have caught, and the fix. The `postmortem` skill adds rows.

Fix ladder, strongest first: **design** (make it impossible) → **check** (lint, test, hook or CI, shown going red on the original case) → **rule file or skill** → **CLAUDE.md line** (last resort).

| Date | What happened | Evidence | Root cause | Rung | Fix |
| ---- | ------------- | -------- | ---------- | ---- | --- |
| 2026-10-29 | Claude wrote both re-review lines on PR 209 with the suffix before the colon: `Reviewer agent at <sha> (re-review since <since>): no blockers`. The `reviewer` check skipped them and failed, naming only the older commits | [PR 209](https://github.com/Jaspyplayz/League-Web-App/pull/209): "the reviewer saw ceee3d8, d394753, not the head commit 3b48be1" | `reviewer.md` said the suffix goes "after it", which reads as after the commit as easily as after the verdict, and the check's message never named the line it couldn't read | Check, plus the rule file | The gate's failure names any line that names a commit but isn't a verdict, and the shape it reads (`scripts/can-merge-gates.ts`, test `names a verdict line it can't read`); `reviewer.md` shows the whole re-review line |
