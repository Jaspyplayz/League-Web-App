# How a change gets made

Claude writes most of Turnpoint's code, so the automatic checks were already strong. What was missing came after the code was written: a check by something other than the Claude that wrote it, and proof that Jasper understands what he merges. This page is that loop: how much review a change gets, who does each step, and what "done" means. [CLAUDE.md](../CLAUDE.md) holds the short rules agents follow; this is the detail behind its "Review tiers" line.

It comes from the workflow audit of 2026-10-20 (a Claude Doc, only viewable from Jasper's account: https://claude.ai/artifact/AKHHeybFuR3cLMBbDnDyd8).

## Review tiers

The thread picks a tier when it starts and names it in the PR, so tiny changes stay as fast as before and only risky ones pay for extra review.

| Tier | What counts | Before code | After code | Jasper's part |
|---|---|---|---|---|
| Tiny | Copy, styling inside one component, docs, Dependabot bumps | Nothing | Commit hook, CI, smoke test | Skim the diff and the preview, merge |
| Normal | A feature or fix inside one area, such as a new Insights card | An issue with 3 to 5 acceptance criteria; Claude reads the code and posts a short plan | Tiny's checks, plus the [reviewer agent](../.claude/agents/reviewer.md) and a screenshot or test name per criterion | "My read" on the PR before merging |
| Risky | `src/db/`, `drizzle/`, sign-in, the Riot client and rate limiter, `src/app/api/`, anything that spends Claude API money, model retraining, a new judgment shown to players (a grade, a cause, a rating), Riot policy questions | Normal's issue, plus a decision record draft; Jasper approves the plan | Normal's checks, plus a second model's review and Jasper's own test of the preview | `/explain-back`, then "My read" |

Every tier runs the same automatic checks; the extra steps in the lower rows are where Jasper's time goes. Until a second model is set up, risky PRs say "no second review yet" in their Review section.

## The steps for a normal change

1. **Frame.** Claude turns Jasper's message into an issue from the "Feature or fix" template ([`.github/ISSUE_TEMPLATE/feature.md`](../.github/ISSUE_TEMPLATE/feature.md)): the player problem in one sentence, acceptance criteria, and what is out of scope. Jasper edits or approves it.
2. **Inspect.** Claude reads the code and docs it will touch, names the files, and checks open PRs for overlap.
3. **Plan.** A short plan in the thread. Normal changes go ahead unless Jasper objects; risky ones wait for his yes.
4. **Test first where logic is pure.** Analyzer changes start with a failing test written from the acceptance criteria.
5. **Implement** in small commits on the thread's branch.
6. **Automatic checks.** The commit hook, then CI, then the smoke test on the Vercel preview.
7. **Self-check against the criteria.** Claude opens the preview and puts one screenshot or test name per criterion in the PR.
8. **Independent review.** The reviewer agent sees the issue, the diff and the test output, never the builder's reasoning. A second model joins only for risky changes.
9. **Triage.** The builder fixes findings it can reproduce, rejects the rest with a reason, and brings real disagreements to Jasper (see below).
10. **Explain back, then merge.** Jasper writes "My read" on the PR and merges; Vercel deploys.
11. **Close out in the same PR.** Docs and decision records change with the code, and `Closes #N` closes the issue.

Tiny changes skip the issue, the plan, the reviewer and "My read": the thread reads the code, makes the change and opens the PR, and Jasper skims the diff and the preview before merging.

The PR template ([`.github/pull_request_template.md`](../.github/pull_request_template.md)) has a section for each of these: the tier, the walkthrough, the criteria with their evidence, the review, the docs touched and "My read".

## Who does what

| Work | Who | Why |
|---|---|---|
| Lint, types, unit tests, build, smoke test, CodeQL, Dependabot | Automatic tools | Same answer every time, free, never tired |
| Framing, planning, implementing, docs | The thread's Claude | It holds the context; handing off loses it |
| Searching a large area, reviewing a diff, digging through logs | A subagent with a fresh context | Keeps noise out of the builder's context and gives an unbiased read |
| Reviewing risky changes | A second model from another company | Different training, different blind spots |
| Acceptance criteria, product calls, the preview check, "My read", merging | Jasper | Judgment, and the learning is the point |

## The reviewer agent

[`.claude/agents/reviewer.md`](../.claude/agents/reviewer.md) is a Claude Code subagent: a second Claude with a fresh context, read-only file tools, and a checklist built from this project's rules (acceptance criteria, inputs that break the analyzer, the Riot and privacy rules, missing tests, claims to players, security and cost, docs that go out of date).

- **When:** once a normal or risky PR's checks pass, the thread asks the reviewer to review its branch against the issue. Jasper can ask for it too, in a project thread or in Claude Code on his computer: "use the reviewer agent on this branch".
- **What it gets:** the acceptance criteria, the diff against `main` and the test output. It treats the PR description as claims to check, not evidence.
- **What comes back:** at most 7 findings, each with a severity (blocker, should-fix, nit), a file and line, a concrete input that goes wrong and a confidence; or "No blockers" and what it checked.
- **Afterwards:** it has Bash for `git diff` and `npm test`, so it ends with `git status` to show it changed nothing. The builder lists each finding in the PR's Review section as fixed (with the test that shows it) or rejected (with the evidence).

## When the reviewer and the builder disagree

1. A finding without a concrete failing case is dropped, whoever wrote it.
2. The builder answers each finding: reproduce it (a failing test or exact steps) and fix it, or reject it with evidence (a passing test, a doc line, the Riot docs).
3. One more round if the reviewer still objects. After that it comes to Jasper as a two-line summary: the claim and the evidence on each side.
4. Jasper decides on evidence, not confidence. A failing test beats an argument. With no test either way, risky paths take the safer behavior and design choices follow `CLAUDE.md`.

## "My read" and `/explain-back`

"My read" is the last section of every normal and risky PR: three to five sentences in Jasper's own words, written before he merges. Claude never writes it, because writing it is how the code becomes his to explain in an interview.

On risky PRs, Jasper first types `/explain-back` (or `/explain-back 135` for PR 135) in Claude Code. The skill ([`.claude/skills/explain-back/SKILL.md`](../.claude/skills/explain-back/SKILL.md)) asks him three questions about the PR, one at a time: what it does, one decision it made, and one input that would break it. Then it lists what he got right and what he missed, with a file and line for each miss. It only runs when he types it, so it costs nothing the rest of the time. If typing `/explain-back` does nothing in a project thread, remove its `disable-model-invocation` line so that asking for a quiz starts it.

## Three meanings of done

- **Merged:** CI is green and it deployed.
- **Verified:** every acceptance criterion has evidence, and Jasper wrote "My read".
- **Validated:** at least three players used it, and Jasper recorded what they said.

## Checking that the loop is worth it

The next three normal PRs go through the whole loop, then a 15-minute retro: did the reviewer find anything real, and did "My read" take under 10 minutes? After 10 normal PRs, count the reviewer's useful findings. If fewer than about 3 in 10 PRs get one, rewrite its prompt once; if the next 10 are no better, drop it.

## Guard rails

- **GitHub** is the lock. The "Protect Main Branch" ruleset requires a pull request before anything reaches `main` (0 approvals, since GitHub won't let you approve your own PR), requires the `check` and `Vercel` checks to pass, and blocks force pushes and deleting `main`.
- **Claude Code's deny rules** in [`.claude/settings.json`](../.claude/settings.json) stop Claude from reading `.env.local`, where the real keys live on Jasper's computer, and from force pushing. The docs say a Bash rule matches the command as Claude writes it and "isn't a security boundary", so these catch mistakes rather than lock anything ([permissions](https://code.claude.com/docs/en/permissions)).
- **The commit hook** in the same file runs lint and typecheck before Claude commits, so CI rarely goes red.
