# 0011: Shorter re-reviews after a fix round

Status: draft, waiting on Jasper's "In my words" (Linear JAS-17). Amends [0010](0010-github-requires-the-reviewer.md): the fresh review a new commit needs can be a re-review.

## Context

Every normal and risky PR gets the reviewer agent, and since 0010 GitHub requires its verdict at the head commit. A fix after a review makes a new head commit, so it needs a new review. Until now, each new review read the whole branch again.

The agents' logs from 2026-10-24 to 10-26 show 32 review agents, with a median of 7 minutes each, about 4 hours in all. On 10-26, one PR had six full reviews in a row, from 01:29 to 02:44 UTC, about 70 minutes. The commits between those reviews only answered the previous review's findings. On JAS-16, round 4 used a brief the builder focused on one new commit and took 5.4 minutes, against 11.9 minutes for round 3's full review.

## Options considered

1. Keep full re-reviews. This is the safest and the slowest, because every fix round costs as much as the first review.
2. Re-review only the commits since the last review, against the earlier reports, when those commits only answer findings.
3. Run several reviewers in parallel, each with part of the checklist. A round might drop from about 7 minutes to 4 or 5 (a guess, not measured), for 2 to 3 times the tokens, and the number of rounds stays the same.
4. Let the builder skip the re-review when a fix looks small. The builder would judge its own fix, which is what the reviewer is there to avoid, and GitHub's required check blocks the merge anyway.

## Decision

Option 2:
- The builder asks for a re-review since the commit the last review saw. It passes the full report, not a summary, of every review pass run at that commit, such as the reviewer's and a security check's.
- Before it narrows anything, the reviewer checks all of these, and does a full review if any fails:
  - the earlier commit is an ancestor of the head, with no merge since;
  - it is the commit on the last "Reviewer agent at" line in the PR's Review section;
  - the reviewer's report starts with that line, lists as many blockers as it counts, and has fewer than 7 findings, since a report at the cap may have left some out;
  - the Review section lists the same findings as the reports, none missing on either side, and answers each one;
  - the new commits only answer those findings.
- Otherwise it reads `git diff <since>..HEAD`, the code that calls what changed, and the docs and rules a full review would read for those files. It judges each answer and still runs `npm test` at the head. It checks each acceptance criterion whose code, test or screenshot page the new commits touch, and every box as GitHub shows it now.
- Its first line is `Reviewer agent at <sha>: no blockers (re-review since <first 7 characters of the earlier commit>)`. The gate in `scripts/can-merge-gates.ts` reads the head commit's verdict the same way whatever follows it, so the gate's code doesn't change. A test in `scripts/can-merge-gates.test.ts` holds that.
- Claude starts every review pass it runs, the reviewer and any security or comment check, on the same head commit, so one fix round answers all of them. Their findings all go in the Review section, and only the reviewer agent's verdict starts with "Reviewer agent at". A security check runs again on the new head when the fix commits touch secrets, sign-in, `src/app/api/` or user input.
- The exact checks live in `.claude/agents/reviewer.md`. `docs/workflow.md` summarizes them and links there, so the two can't disagree.

## Consequences

Good:
- A fix round should cost about half a full review. That's a guess from one focused review on JAS-16, which was a hand-written brief, not this exact procedure.
- The first review still reads the whole branch. CI, the smoke test and `npm test` still run on every commit.
- A finding missing from the brief or from the Review section's answers sends the re-review back to a full review, so a fix round can't quietly drop one by mistake.
- The verdict line says what the review covered, so anyone reading the PR can tell a re-review from a full one.

Bad:
- A fix that breaks code far from what it changed gets a lighter look. The reviewer reads the callers of what changed and the tests run, but nothing reads the rest of the branch again.
- The reviewer decides whether the new commits only answer findings. If a builder slips new work into a fix commit, only the reviewer can catch it.
- The re-review trusts the builder to pass the reports and record the findings as they were. A builder set on hiding a finding could leave it out of both. The gate doesn't check that a full review came first. It's the same bar as 0010: it stops mistakes, not someone set on getting around it.
- A security check runs again only when the fix commits touch secrets, sign-in, API routes or user input. A fix elsewhere that brings in a security problem relies on the re-review's security check.
- A report at the 7-finding cap, a session that lost the earlier reports, and a PR another tool reviewed all get a full review, so they save nothing.

## In my words

_(Jasper writes this.)_
