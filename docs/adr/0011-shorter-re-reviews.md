# 0011: Shorter re-reviews after a fix round

Status: draft, waiting on Jasper's "In my words" (Linear JAS-17). Amends [0010](0010-github-requires-the-reviewer.md): the fresh review a new commit needs can be a re-review.

## Context

Every normal and risky PR gets the reviewer agent, and since 0010 GitHub requires its verdict at the head commit. A fix after a review makes a new head commit, so it needs a new review. Until now, each new review read the whole branch again.

The agents' logs from 2026-10-24 to 10-26 show 32 review agents, with a median of 7 minutes each, about 4 hours in all. On 10-26, one PR had six full reviews in a row, from 01:29 to 02:44 UTC, 75 minutes. The commits between those reviews only answered the previous review's findings. On JAS-16, round 4 used a brief the builder focused on one new commit and took 5.4 minutes, against 11.9 minutes for round 3's full review.

## Options considered

1. Keep full re-reviews. This is the safest and the slowest, because every fix round costs as much as the first review.
2. Re-review only the commits since the last review, against the earlier report, when those commits only answer findings.
3. Run several reviewers in parallel, each with part of the checklist. A round might drop from about 7 minutes to 4 or 5 (a guess, not measured), for 2 to 3 times the tokens, and the number of rounds stays the same.
4. Let the builder skip the re-review when a fix looks small. The builder would judge its own fix, which is what the reviewer is there to avoid, and GitHub's required check blocks the merge anyway.

## Decision

Option 2, for the reviewer agent's own review only:
- The builder asks for a re-review since the commit the reviewer last saw. It passes the reviewer's full report from that commit, not a summary.
- A re-review works only when that review is the only one at that commit or after it. After any other review, such as Grok's, a security check or a comment check, the next review is a full one. Every review gets its own line in the PR's Review section naming the commit it saw, even when it found nothing, and a review without one sends the re-review back to a full review. The first drafts let a re-review cover every review at the earlier commit, and four of the first five rounds of review each found another way one review's findings could go unchecked. The last was a review recorded after the earlier commit, which no check looked at. Covering one review closes that kind of hole and is easier to explain. Re-reviews still save time on normal PRs where the reviewer agent is the only review.
- Before it narrows anything, the reviewer checks all of these, and does a full review if any fails:
  - the earlier commit is an ancestor of the head, with no merge since;
  - every review in the PR's Review section has its own line naming the commit it saw, each of those commits is that commit or an earlier one, and the only line at it is the "Reviewer agent at" line;
  - the reviewer's report starts with that line, lists as many blockers as it counts, and has fewer than 7 findings, since a report at the cap may have left some out;
  - the Review section lists the same findings as the report, none missing on either side, and answers each one;
  - the new commits only answer those findings.
- Otherwise it reads `git diff <since>..HEAD`, the code that calls what changed, and the docs and rules a full review would read for those files. It judges every file the branch changes by main's rules, and that check now covers anything in `.claude/`, such as `reviewer.md`. It judges each answer and still runs `npm test` at the head. It checks each acceptance criterion whose code, test or screenshot page the new commits touch, and every box as GitHub shows it now.
- Its first line is `Reviewer agent at <sha>: no blockers (re-review since <first 7 characters of the earlier commit>)`. The gate in `scripts/can-merge-gates.ts` reads the head commit's verdict the same way whatever follows it, so the gate's code doesn't change. A test in `scripts/can-merge-gates.test.ts` holds that.
- Claude starts every review pass it runs, the reviewer and any security or comment check, on the same head commit, so one fix round answers all of them. Their findings all go in the Review section. Only the reviewer agent's verdict says "Reviewer agent at", and `AGENTS.md` tells the Cursor chat's review, on Grok, to start with "Second review (<model>) at <sha>:". A fix for something the builder found itself isn't in any report, so the next review after it is a full one. A security check runs again on the new head when the fix commits touch secrets, sign-in, `src/app/api/` or user input.
- The exact checks live in `.claude/agents/reviewer.md`. `docs/workflow.md` summarizes them and links there, so the two can't disagree.

## Consequences

Good:
- A fix round should cost about half a full review. That's a guess from one focused review on JAS-16, which was a hand-written brief, not this exact procedure.
- The first review still reads the whole branch. CI, the smoke test and `npm test` still run on every commit.
- A finding missing from either the brief or the Review section sends the re-review back to a full review. So does any other review at or after the earlier commit, or one recorded without its commit.
- The verdict line says what the review covered, so anyone reading the PR can tell a re-review from a full one.

Bad:
- A fix that breaks code far from what it changed gets a lighter look. The reviewer reads the callers of what changed and the tests run, but nothing reads the rest of the branch again.
- The reviewer decides whether the new commits only answer findings. If a builder slips new work into a fix commit, only the reviewer can catch it.
- A finding missing from both the brief and the Review section isn't caught, whether by mistake, such as a should-fix lost in copying, or on purpose. Neither is a review nobody recorded, such as a security check the builder forgot to write down. The gate doesn't check that a full review came first either. It's the same bar as 0010: it stops many mistakes, not someone set on getting around it. Putting the number of findings in the verdict line would catch a lost should-fix. It was left out because it changes the line every PR uses.
- A security check runs again only when the fix commits touch secrets, sign-in, API routes or user input. A fix elsewhere that brings in a security problem relies on the re-review's security check.
- A report at the 7-finding cap, a session that lost the earlier report, and a fix round after any other review all get a full review, so they save nothing. Risky PRs, which get the Grok review, save less. Step 8 starts every pass on the same commit, and the security check runs again when a fix touches secrets, sign-in, API routes or user input. So a PR that gets a security check, such as one touching `src/app/api/`, gets a full review in every round.
- The rule to judge a PR by main's copy lives in `reviewer.md` itself. A reviewer started from the branch's checkout runs the branch's copy, so a PR that deletes that rule escapes it. The backstops are the builder's brief, which can name main's rules, and the risky list, which sends any change to `.claude/agents/` to Jasper.

## In my words

_(Jasper writes this.)_
