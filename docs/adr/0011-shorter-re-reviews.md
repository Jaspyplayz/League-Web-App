# 0011: Shorter re-reviews after a fix round

Status: draft, waiting on Jasper's "In my words" (Linear JAS-17). Amends [0010](0010-github-requires-the-reviewer.md): the fresh review a new commit needs can be a re-review.

## Context

Every normal and risky PR gets the reviewer agent, and since 0010 GitHub requires its verdict at the head commit. A fix after a review makes a new head commit, so it needs a new review. Until now, each new review read the whole branch again.

The agents' logs from 2026-10-24 to 10-26 show 32 review agents, with a median of 7 minutes each, about 4 hours in all. On 10-26, one PR had six full reviews in a row, from 01:29 to 02:44 UTC, about 70 minutes. The commits between those reviews only answered the previous review's findings. On JAS-16, round 4 used a brief the builder focused on one new commit and took 5.4 minutes, against 11.9 minutes for round 3's full review.

## Options considered

1. Keep full re-reviews. This is the safest and the slowest, because every fix round costs as much as the first review.
2. Re-review only the commits since the last review, against the earlier report, when those commits only answer findings.
3. Run several reviewers in parallel, each with part of the checklist. A round might drop from about 7 minutes to 4 or 5 (a guess, not measured), for 2 to 3 times the tokens, and the number of rounds stays the same.
4. Let the builder skip the re-review when a fix looks small. The builder would judge its own fix, which is what the reviewer is there to avoid, and GitHub's required check blocks the merge anyway.

## Decision

Option 2:
- The builder asks for a re-review since the commit the last review saw. It passes that review's full report, not a summary, plus the report of any other pass, such as a security check, whose findings it fixed.
- The reviewer first checks that the earlier commit is an ancestor of the head with no merge since, that the report lists as many blockers as its first line counts, that the same line is in the PR's Review section, that the Review section answers every finding in the report, and that the new commits only answer findings. If any check fails, it does a full review.
- Otherwise it reads `git diff <since>..HEAD` and the code that calls what changed, judges each answer, and still runs `npm test` at the head. It checks acceptance criteria only where the new commits change their evidence.
- Its first line is `Reviewer agent at <sha>: no blockers (re-review since <sha>)`. The gate in `scripts/can-merge-gates.ts` reads the head commit's verdict the same way whatever follows it, so the gate's code doesn't change. A test in `scripts/can-merge-gates.test.ts` holds that.
- Claude starts every review pass it runs, the reviewer and any security or comment check, on the same head commit, so one fix round answers all of them. Their findings all go in the Review section. The other passes don't run again after the fix round.

## Consequences

Good:
- A fix round should cost about half a full review. That's a guess from one focused review on JAS-16, which was a hand-written brief, not this exact procedure.
- The first review still reads the whole branch. CI, the smoke test and `npm test` still run on every commit.
- An unanswered finding sends the re-review back to a full review, so a fix round can't quietly drop a blocker.
- The verdict line says what the review covered, so anyone reading the PR can tell a re-review from a full one.

Bad:
- A fix that breaks code far from what it changed gets a lighter look. The reviewer reads the callers of what changed and the tests run, but nothing reads the rest of the branch again.
- The reviewer decides whether the new commits only answer findings. If a builder slips new work into a fix commit, only the reviewer can catch it.
- The re-review trusts the builder to pass the earlier report as it was. It checks the blocker count against the first line, but a builder set on hiding a finding could edit both. The gate doesn't check that a full review came first. It's the same bar as 0010: it stops mistakes, not someone set on getting around it.
- The other passes don't run again, so a fix for a security finding is judged by the reviewer, not by the security check that found it.
- Re-reviews need the earlier report, so a session that lost it, or a PR another tool reviewed, gets a full review.

## In my words

_(Jasper writes this.)_
