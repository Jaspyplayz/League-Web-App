# 0011: Shorter re-reviews after a fix round

Status: draft, waiting on Jasper's "In my words" (Linear JAS-17).

## Context

Every normal and risky PR gets the reviewer agent, and since [0010](0010-github-requires-the-reviewer.md) GitHub requires its verdict at the head commit. A fix after a review makes a new head commit, so it needs a new review. Until now, each new review read the whole branch again.

The agents' logs from 2026-10-24 to 10-26 show 32 review agents, with a median of 7 minutes each, about 4 hours in all. On 10-26, one PR had six full reviews in a row, from 01:29 to 02:44 UTC, about 70 minutes. The commits between those reviews only answered the previous review's findings. On JAS-16, round 4 used a brief focused on the new commit and took 5.4 minutes, against 11.9 minutes for round 3's full review.

## Options considered

1. Keep full re-reviews. This is the safest and the slowest, because every fix round costs as much as the first review.
2. Re-review only the commits since the last review, with the earlier findings, when those commits only answer findings.
3. Run several reviewers in parallel, each with part of the checklist. A round might drop from about 7 minutes to 4 or 5 (a guess, not measured), for 2 to 3 times the tokens, and the number of rounds stays the same.
4. Let the builder skip the re-review when a fix looks small. The builder would judge its own fix, which is what the reviewer is there to avoid, and GitHub's required check blocks the merge anyway.

## Decision

Option 2:
- The builder asks for a re-review since the commit the last review saw.
- The reviewer first checks that the PR's Review section has a verdict line for that commit, that no commit since then merges main, and that the new commits only answer findings. If any check fails, it does a full review.
- Otherwise it reads `git diff <since>..HEAD`, the earlier findings with the builder's answers, and the code that calls what changed. It still runs `npm test` at the head.
- Its first line is `Reviewer agent at <sha>: no blockers (re-review since <sha>)`. The gate in `scripts/can-merge-gates.ts` reads the head commit's verdict the same way whatever follows it, so the gate's code doesn't change. A test in `scripts/can-merge-gates.test.ts` holds that.
- Claude starts every review pass it runs, the reviewer and any security or comment check, on the same head commit, so one fix round answers all of them.

## Consequences

Good:
- A fix round costs about half a full review, going by JAS-16's one example.
- The first review still reads the whole branch. CI, the smoke test and `npm test` still run on every commit.
- The verdict line says what the review covered, so anyone reading the PR can tell a re-review from a full one.

Bad:
- A fix that breaks code far from what it changed gets a lighter look. The reviewer reads the callers of what changed and the tests run, but nothing reads the rest of the branch again.
- The reviewer decides whether the new commits only answer findings. If a builder slips new work into a fix commit, only the reviewer can catch it.
- The gate doesn't check that the commit a re-review started from was reviewed. The reviewer checks it, but anyone who can edit the description could skip that. It's the same bar as 0010: it stops mistakes, not someone set on getting around it.
- 5.4 against 11.9 minutes is one pair of runs. The saving on other PRs is a guess until more re-reviews run.

## In my words

_(Jasper writes this.)_
