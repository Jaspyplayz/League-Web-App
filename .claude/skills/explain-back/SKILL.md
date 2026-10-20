---
name: explain-back
description: Quiz Jasper on a pull request before he merges it. Use only when he types /explain-back or asks to be quizzed on a PR; never start it on your own.
argument-hint: "[PR number]"
---

The PR to quiz on: $ARGUMENTS (if that's empty, run `git fetch origin main` and
use `git diff origin/main...HEAD`, since a local main can be far behind).

Read the PR's diff and its issue. Ask Jasper three questions, one at a time:
what the change does in one sentence, one decision it made and the alternative,
and one input that would break it. Wait for each answer before asking the next.
Never answer for him. At the end, list what he got right and what he missed,
with file:line for each miss. Never write "My read" for him; he writes it on the
PR in his own words.
