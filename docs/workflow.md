# How a change gets made

One tool writes each change, Claude Code by default, so the automatic checks were already strong. What was missing came after the code was written: a check by something other than the Claude that wrote it, and proof that Jasper understands what he merges. This page is that loop: how much review a change gets, who does each step, and what "done" means. [CLAUDE.md](../CLAUDE.md) holds the short rules agents follow; this is the detail behind its "Review tiers" line.

It comes from the workflow audit of 2026-10-20 (a Claude Doc, only viewable from Jasper's account: https://claude.ai/artifact/AKHHeybFuR3cLMBbDnDyd8).

## Review tiers

The thread picks a tier when it starts and names it in the PR, so tiny changes stay as fast as before and only risky ones pay for extra review.

| Tier | What counts | Before code | After code | Jasper's part |
|---|---|---|---|---|
| Tiny | Copy, styling inside one component, docs, Dependabot's weekly minor and patch bumps | Nothing | Commit hook, CI, smoke test and accessibility scan, plus the reviewer agent unless it changes only docs | None for Claude Code's own PRs off the [risky list](../scripts/risky-paths.ts), which it merges with `npm run can-merge`. Skim and merge the rest |
| Normal | A feature or fix inside one area, such as a new Insights card; a Dependabot major version bump; a change in `.github/` or `.claude/` that adds or tightens a check, which Jasper merges when it touches the risky list | A [Linear ticket](#work-starts-as-a-linear-ticket) with 3 to 5 acceptance criteria; Claude reads the code and posts a short plan | Tiny's checks, plus the [reviewer agent](../.claude/agents/reviewer.md) and a screenshot or test name per criterion | None for Claude Code's own PRs off the risky list, once the reviewer finds no blockers. Merge the rest. "My read" when he chooses |
| Risky | Database code (`src/db/`, `drizzle/`, the stores in `src/lib/`, scripts that use the live database), sign-in, the Riot client and rate limiter, `src/app/api/`, server actions, the MCP server, anything that spends Claude API money, model retraining, a new judgment shown to players (a grade, a cause, a rating), Riot policy questions, anything that removes or loosens a check (a CI step, the commit hook, a deny rule) | Normal's ticket, plus a draft [decision record](#decision-records); Jasper approves the plan | Normal's checks, plus a second model's review and Jasper's own test of the preview | `/explain-back`, then he merges it himself |

Every tier runs the same automatic checks; the extra steps in the lower rows are where Jasper's time goes. Claude Code writes this app on Opus 5.5. The second look on a risky pull request is Grok 4.7, in the Cursor chat, through pstack ([`.cursor/settings.json`](../.cursor/settings.json)). If that review cannot be run, the PR says "no second review yet".

## The steps for a normal change

1. **Frame.** The builder turns Jasper's message into a Linear ticket, or takes the ticket Grok Bot wrote. The ticket has the sections of the "Feature or fix" template ([`.github/ISSUE_TEMPLATE/feature.md`](../.github/ISSUE_TEMPLATE/feature.md)): the player problem in one sentence, acceptance criteria, what is out of scope, and which tool will write the code. Jasper edits or approves it.
2. **Inspect.** Claude reads the code and docs it will touch, names the files, and checks open PRs for overlap.
3. **Plan.** A short plan in the thread. Normal changes go ahead unless Jasper objects; risky ones wait for his yes.
4. **Test first where logic is pure.** Analyzer changes start with a failing test written from the acceptance criteria.
5. **Implement** in small commits on the thread's branch.
6. **Automatic checks.** The commit hook, then CI (with the golden tests and dependency review), then the smoke test and accessibility scan on the Vercel preview.
7. **Self-check against the criteria.** Claude takes one screenshot of the preview per criterion with the [`verify` skill](../.claude/skills/verify/SKILL.md) (`npm run shot`), or names the test that shows it, and puts them in the PR. When a criterion needs a click or typing, a journey from [`verify-turnpoint`](../.claude/skills/verify-turnpoint/SKILL.md) or [`verify-turnpoint-ux`](../.claude/skills/verify-turnpoint-ux/SKILL.md) gives the screenshots before and after it.
8. **Independent review.** The reviewer agent sees the ticket, the diff and the test output, never the builder's reasoning. For a risky change, the Cursor chat reviews the same diff on Grok 4.7 and does not edit the code. Claude starts every review pass it runs, the reviewer and any security or comment check, on the same head commit, so one fix round answers them all.
9. **Triage.** The builder fixes findings it can reproduce, rejects the rest with a reason, and brings real disagreements to Jasper (see below). A fix after the review needs a fresh review of the new head commit. When the new commits only answer the reviewer agent's findings, that review can be a shorter [re-review](#the-reviewer-agent) of them. [`reviewer.md`](../.claude/agents/reviewer.md) lists the conditions, and when one fails, such as a merge of `main` or another review at that commit, it's a full one.
10. **Merge.** Claude Code merges its own tiny or normal PR with `npm run can-merge -- <pr> --merge`, run from an up-to-date main checkout. It merges only when every gate in [`scripts/can-merge-gates.ts`](../scripts/can-merge-gates.ts) passes at the head commit: agent merging is on, no Claude merge was reverted, the PR is Claude Code's, it's tiny or normal, it touches nothing on the [risky list](../scripts/risky-paths.ts), and the latest runs of `check`, `Vercel` and `smoke` passed. A normal PR, and a tiny one that changes anything but docs, also needs the reviewer's "no blockers" for that commit. A normal PR also needs every criterion ticked. `can-merge` checks only the ticks, and the reviewer checks that each criterion has a screenshot or test name ([decision record 0009](adr/0009-can-merge-covers-database-code-and-tiny-code.md)). It marks the merge commit as Claude's, then labels the PR `merged-by-claude` and comments with each gate. Jasper merges risky PRs, after `/explain-back`, and every PR Claude Code didn't build. GitHub's required `reviewer` check ([`.github/workflows/reviewer.yml`](../.github/workflows/reviewer.yml)) runs the same reviewer rule, so nobody can merge a PR from GitHub's website either until the reviewer clears its head commit ([decision record 0010](adr/0010-github-requires-the-reviewer.md)). Once the verdict is in the description, wait for the new `reviewer` run to pass before running `can-merge`, which refuses while any check is still running. Vercel deploys.
11. **Close out in the same PR.** Docs and decision records change with the code. The ticket ID in the branch name closes the ticket when the PR merges. For an older GitHub issue, `Closes #N` in the PR closes it.
12. **After the merge.** The Cursor chat, on Grok 4.7, updates [docs/STATUS.md](STATUS.md) and any doc the pull request left wrong. It does not redo the code. A scheduled task on Jasper's PC pulls `main` every 30 minutes, but only when that folder is on `main` with nothing uncommitted, so it never touches a branch in progress. A local git hook then rebuilds the notes in his private Obsidian vault from the merged PRs. The thread that drove the PR adds a dated, facts-only entry to his Dev Log there (what changed, what's next); the "why" and "what I learned" lines are his to write.

Tiny changes skip the ticket, the plan and "My read". A tiny change to docs alone also skips the reviewer. A tiny change to anything else gets the reviewer before it merges, because the PR names its own tier. Only the `.md`, `.png`, `.jpg`, `.gif` and `.webp` files in `docs/` and the root `README.md` and `ARCHITECTURE.md` count as docs. This file, any `CLAUDE` or `AGENTS` file and anything in a dot folder don't, because agents follow them as rules. The thread reads the code, makes the change, opens the PR and, once the checks pass, merges it with `npm run can-merge`. Step 12 still happens.

The PR template ([`.github/pull_request_template.md`](../.github/pull_request_template.md)) has a section for each of these: the tier, the walkthrough, the criteria with their evidence, the review, the docs touched and "My read".

## Who does what

| Work | Who | Why |
|---|---|---|
| Lint, types, unit and golden tests, build, smoke test, accessibility scan, dependency review, CodeQL, Dependabot | Automatic tools | Same answer every time, free, never tired |
| Framing, planning, implementing, docs that belong with the code, merging its own tiny and normal PRs | Claude Code, on Opus 5.5 | It holds the thread, and the code has to stay explainable |
| Searching a large area, digging through logs | A subagent with a fresh context | Keeps noise out of the builder's context |
| Reviewing a risky diff, then updating status and leftover docs after the merge | The Cursor chat, on Grok 4.7 | A different model family from the one that wrote the code |
| Acceptance criteria, product calls, the preview check, "My read", merging risky PRs and every PR Claude Code didn't build | Jasper | Judgment, and the learning is the point |

## The reviewer agent

[`.claude/agents/reviewer.md`](../.claude/agents/reviewer.md) is a Claude Code subagent: a second Claude with a fresh context, read-only file tools, and a checklist built from this project's rules (acceptance criteria, inputs that break the analyzer, the Riot and privacy rules, missing tests, claims to players, security and cost, docs that go out of date). It starts with the `code-review-and-quality` [skill](#skills) loaded, and loads the security, database, UI or testing skill when the diff needs one.

- **When:** once a normal or risky PR's checks pass, the thread asks the reviewer to review its branch against the ticket. On a PR Claude Code didn't build, such as Dependabot's, the Cursor chat's or a cloud agent's, Claude runs the reviewer and puts its verdict in the description's `## Review` section, since GitHub's required `reviewer` check reads it there. If the description has no Review section, Claude adds one. A second `## Review` section doesn't count, because the check reads only the first. Jasper can ask for it too: in a project thread in the Claude app, "run the reviewer on #135"; in Claude Code on his computer, "use the reviewer agent on this branch".
- **What it gets:** the acceptance criteria and the test output, and for a re-review, the PR number and its own full report at the earlier commit. It reads the diff itself: against `main` for a full review, or the commits since the earlier one for a re-review. It treats the PR description as claims to check, not evidence.
- **What comes back:** a first line naming the commit it reviewed, `Reviewer agent at <sha>: no blockers` or `Reviewer agent at <sha>: <n> blockers`, which the builder copies into the PR's Review section, where `npm run can-merge` and GitHub's required `reviewer` check read it. Then at most 7 findings, each with a severity (blocker, should-fix, nit), a file and line, a concrete input that goes wrong and a confidence; or "No blockers" and what it checked.
- **Re-reviews:** after a fix round, the builder asks for a re-review since the commit the reviewer last saw. That works only when the reviewer agent's review is the only one at that commit or after it, so any other review, such as Grok's, a security check or a comment check, at that commit or a later one means the next review is a full one. The builder passes the reviewer's full report, not a summary. Before it narrows anything, the reviewer checks that commit, that report and the Review section's answers against each other, and the list of checks is in [`reviewer.md`](../.claude/agents/reviewer.md). If any check fails, it does a full review. Otherwise it reads only the new commits and what they touch, judges each answer, and still runs `npm test`. A security check runs again on the new head when the fix commits touch secrets, sign-in, `src/app/api/` or user input. The re-review's first line ends in ` (re-review since <first 7 characters of that commit>)`, and the gate reads it like any other verdict line. On JAS-16, a review the builder focused on one new commit took 5.4 minutes, against 11.9 for the full one before it ([decision record 0011](adr/0011-shorter-re-reviews.md)).
- **Running the check again:** editing the description runs GitHub's `reviewer` check again. Don't use its Re-run button. A re-run reads the description from when that run first started, so it can bring back an old result, even a pass from before a later review found blockers. GitHub doesn't run the check while the PR has a merge conflict, so it waits until the conflict is fixed.
- **Afterwards:** it has Bash for `git diff` and `npm test`, so it ends with `git status` to show it changed nothing. The builder lists each finding in the PR's Review section as fixed (with the test that shows it) or rejected (with the evidence), and the next full review judges every one of those answers, from any review. Every other pass, such as a security check, a comment check or the Grok review, gets its own line there naming the full commit it saw, even when it found nothing, such as `Security check at <sha>: no findings` or `Second review (Grok 4.7) at <sha>: 1 blockers`, with its findings under it. When that line names the commit the reviewer last saw or a later one, it tells the next reviewer to do a full review. A review of an older commit written in after a later review ran isn't caught that way, so the builder asks for a full review next. Only review lines take the `<name> at <sha>:` shape, so label a round some other way, such as `Round 2 (ef2169a)`. A finding that quotes a review line counts as one too, so quote it without its `at <sha>:` part. Only the reviewer agent's verdict says "Reviewer agent at", because the gate reads every line containing that phrase. A fix for something the builder found itself isn't in any report, so the next review after it is a full one.

## When the reviewer and the builder disagree

1. A finding without a concrete failing case is dropped, whoever wrote it.
2. The builder answers each finding: reproduce it (a failing test or exact steps) and fix it, or reject it with evidence (a passing test, a doc line, the Riot docs).
3. One more round if the reviewer still objects. After that it comes to Jasper as a two-line summary: the claim and the evidence on each side.
4. Jasper decides on evidence, not confidence. A failing test beats an argument. With no test either way, risky paths take the safer behavior and design choices follow `CLAUDE.md`.

## "My read" and `/explain-back`

"My read" is the last section of every normal and risky PR: three to five sentences in Jasper's own words, written when he chooses, before or after the merge. It isn't a merge gate. Claude never writes it, because writing it is how the code becomes his to explain in an interview.

On risky PRs, Jasper first asks for a quiz: in a project thread in the Claude app, "quiz me on #135" (or `/explain-back 135`), and in Claude Code on his computer, `/explain-back 135`. The skill ([`.claude/skills/explain-back/SKILL.md`](../.claude/skills/explain-back/SKILL.md)) asks him three questions about the PR, one at a time: what it does, one decision it made, and one input that would break it. Then it lists what he got right and what he missed, with a file and line for each miss. Its description tells Claude to start it only when he asks, never on its own.

## Skills

A skill is a Markdown file of instructions that Claude loads when a task matches its description, or when you type its name as a command. The ones in [`.claude/skills/`](../.claude/skills/) work everywhere Claude works on this repo: project threads in the Claude app, subagents such as the reviewer, and Claude Code on Jasper's computer. Cursor loads them too, because it reads `.claude/skills/` as well as its own `.cursor/skills/`. So each skill lives here once and both tools use it. Don't copy one into `.cursor/skills/`.

| Skill | Used for |
|---|---|
| `explain-back` | Turnpoint's own: the quiz before merging (above) |
| `verify` | Turnpoint's own: screenshots of a page on the PR's preview with `npm run shot`, one per acceptance criterion (step 7), plus a map of the main pages and their traps |
| `verify-turnpoint` | Turnpoint's own: journeys that click and type through the app in Chromium, such as a Riot ID lookup, with a screenshot and an accessibility snapshot after each step. It starts and stops its own dev server on Windows and Linux |
| `verify-turnpoint-ux` | Turnpoint's own: the same harness for how a flow feels, such as a search form that keeps your text after a mistake, or a home page that fits a phone |
| `code-review-and-quality` | Five things to check in a review: correctness, readability, architecture, security, performance. The reviewer starts with it |
| `test-driven-development`, `debugging-and-error-recovery` | Writing the failing test first; finding the cause of a failure before fixing it |
| `security-and-hardening` | Sign-in, API routes, user input and secrets |
| `supabase-postgres-best-practices` | Tables, indexes and queries in `src/db/` |
| `frontend-ui-engineering` | Pages and components, including accessibility |
| `documentation-and-adrs` | Docs and [decision records](#decision-records) |
| `doubt-driven-development` | An extra fresh-context check of each decision, for risky changes only, since it starts more agents |

All but `explain-back` and the three `verify` skills are copied unchanged from other people's open-source repos, with their MIT licenses in [THIRD-PARTY-NOTICES.md](../.claude/skills/THIRD-PARTY-NOTICES.md). They give general advice, so where one disagrees with `CLAUDE.md` or this page, the repo wins.

Rules that matter in only one part of the code live in [`.claude/rules/`](../.claude/rules/) instead: design, the analyzer, the database and the Riot client. Each loads when Claude opens a file in its area, so they cost nothing the rest of the time.

## Decision records

A decision record is a one-page note on a big choice and why it was made, the answer to "why did you build it this way?". Each one is a file in `docs/adr/`, named `NNNN-title.md`, with these sections: Context, Options considered, Decision, Consequences (good and bad), and "In my words", two or three sentences Jasper writes without Claude. Once merged, a record isn't edited; a new one replaces it and the old one says "superseded by NNNN".

Numbers 0001 to 0004 are saved for the four records [#16](https://github.com/Jaspyplayz/League-Web-App/issues/16) asks Jasper to write, so the first record a risky PR drafts is 0005.

## Three meanings of done

- **Merged:** CI is green and it deployed, whether Jasper or `npm run can-merge` merged it.
- **Verified:** every acceptance criterion has evidence. "My read" can come later and isn't part of it.
- **Validated:** at least three players used it, and Jasper recorded what they said.

## Which tool writes the code

One change has one builder. Running Claude Code, the Cursor chat, and a cloud agent on the same ticket spends two bills and drops the context each time it changes hands. Name the builder on the ticket before any code.

| Builder | Model | Use it when |
|---|---|---|
| Claude Code, in Cursor or the terminal | Opus 5.5 | The default for this app. A feature, a fix, and anything Jasper has to explain. The hard mistakes here are judgments: a wrong death sentence, a wiped profile, a Riot call that gives up. |
| Cursor chat | Grok 4.7 | Jasper is at the machine. A small edit, a review of a pull request Claude Code opened, and the status and doc update after that pull request merges. It can see files that are not committed yet. It does not take a ticket whose builder is Claude Code. |
| A Cursor cloud agent | Grok 4.7 or Composer | The ticket names it, and the work can start from `origin/main`. Opus stays in Claude Code. A Claude model on a cloud agent spends prepaid credit. |

The other two stay off that branch. Cursor can review a pull request Claude Code opened, and Claude Code can review one a cloud agent opened. That is the second look, not a second builder.

A cloud agent opens a draft pull request and stops. Claude Code runs the reviewer on it and adds the verdict to its description, so GitHub's required `reviewer` check passes. Then Jasper merges it, since `npm run can-merge` only takes Claude Code's own pull requests. The two-branch limit still holds, whichever tools are writing.

## Work starts as a Linear ticket

Since 2026-10-25, work is tracked in Linear tickets, not GitHub issues. The workspace is [linear.app/jaspy](https://linear.app/jaspy). It has one team, JAS, and one project for each app: Turnpoint and Petri. Put a Turnpoint ticket in the Turnpoint project. Grok Bot, Jasper's chief of staff in Cursor, and its Engineering Lead write most tickets. Claude Code reads and writes them through its Linear connector. GitHub issues opened before that date stay open until they are done.

- **The branch name carries the ticket ID.** Claude Code names its branch `claude/jas-<n>-<short-name>`. A cloud agent uses the branch name that Linear copies (`jaspyplayz/jas-<n>-...`). Linear then attaches the PR to the ticket and marks the ticket Done when the PR merges. An ID in the PR description alone does not link it. #176's branch had no ID, so JAS-11 shows no PR. `npm run can-merge` checks only the `claude/` prefix.
- **Claude Code comments on each ticket it builds.** It comments when it starts, with the branch name. It comments when it opens the PR, with the link. It comments at the end of each session, with what is done, what is next and what is blocked. A ticket with Claude Code's start comment has its builder, so no cloud agent starts on it.
- **Tiny changes need no ticket**, the same as they needed no issue.

## pstack and cloud agents

pstack runs in Cursor, turned on in [`.cursor/settings.json`](../.cursor/settings.json). Since 2026-10-24 it also runs in Claude Code, as the `pstack@pstack-claude` plugin, a port of the Cursor version. Claude Code's reviewer agent is the first review. On a risky pull request, the Cursor chat runs the pstack review on Grok 4.7 and reports findings without editing the files.

`/setup-pstack` writes `~/.cursor/rules/pstack-models.mdc` on that computer. The skill defaults name slugs this Cursor account cannot spawn (`grok-4.7-xhigh-fast`, `claude-opus-5-5-xhigh`). On 2026-10-24 the rule maps those roles to `grok-4.7-high` and `claude-opus-5-5-high`. For this repo the ticket wins over that role map: a ticket that names Claude Code is written on Opus 5.5, even if a pstack role says Grok writes bug fixes.

Claude Code's copy reads its role models from `~/.claude/pstack-models.md`, which puts every role on Opus except the multi-model review panels. The plugin does not update itself. To update it, run `claude plugin marketplace update pstack-claude`, then `claude plugin update pstack@pstack-claude`, and restart Claude Code. Then check that the role names in the model file still match.

A cloud agent is a separate virtual machine and a separate branch, started from the remote branch (usually `origin/main`). It can install the app and run the checks below on that copy. It does not see uncommitted work on Jasper's computer, and it does not have the live site's secrets unless they are already in the cloud environment. It starts only when the ticket names it as the builder. The two-branch limit above still holds.

The audit fixes [#145](https://github.com/Jaspyplayz/League-Web-App/issues/145) and [#148](https://github.com/Jaspyplayz/League-Web-App/issues/148) through [#151](https://github.com/Jaspyplayz/League-Web-App/issues/151) name Claude Code. After each one merges, the Cursor chat updates status and any doc that pull request left wrong.

The loop's proof is the checks CI runs, plus the `verify` skill's screenshots for a change a player can see:

| Check | Command | When |
|---|---|---|
| Lint, with the project rules in `eslint-rules/` | `npm run lint` | Every change |
| Types | `npm run typecheck` | Every change |
| Unit and golden tests | `npm test` | Every change |
| Smoke test and accessibility scan | `npm run test:e2e` | A change a player can see |
| Screenshots of the preview | `npm run shot -- --pr <number> <path>` | A change a player can see, one per acceptance criterion |

An agent is not done when the code compiles. It is done when the checks that apply have been run, and each acceptance criterion names the test or the screen that shows it.

## Checking that the loop is worth it

The next three normal PRs go through the whole loop, then a 15-minute retro: did the reviewer find anything real, and did "My read" take under 10 minutes? After 10 normal PRs, count the reviewer's useful findings. If fewer than about 3 in 10 PRs get one, rewrite its prompt once; if the next 10 are no better, drop it.

## Guard rails

- **GitHub** is the lock. The "Protect Main Branch" ruleset requires a pull request before anything reaches `main` (0 approvals, since GitHub won't let you approve your own PR), requires the `check`, `Vercel` and `reviewer` checks to pass, each only from the app that runs it (GitHub Actions for `check` and `reviewer`, Vercel for `Vercel`), so a commit status with the same name doesn't count, and blocks force pushes and deleting `main`. Nobody is on its bypass list, so on any PR that needs the reviewer, the `reviewer` check blocks Jasper's merge button too until the reviewer clears the head commit.
- **Claude Code's deny rules** in [`.claude/settings.json`](../.claude/settings.json) stop Claude's file tools, and commands like `cat` and `sed`, from reading `.env.local`, where the real keys live on Jasper's computer. They also refuse force pushes (`--force`, `--force-with-lease`, `-f` or a `+branch`, written as `git push` or `git -C <folder> push`). A Bash rule matches the command as Claude writes it, so the docs say it "isn't a security boundary" ([permissions](https://code.claude.com/docs/en/permissions)): a search like `grep -r` over the whole folder, a script that opens the file, or a combined flag like `-uf` gets past these. They catch mistakes; GitHub is the lock.
- **The commit hook** in the same file runs lint and typecheck when Claude runs `git commit`, or `git -C <folder> commit` the way subagents commit in their own worktrees, and checks the folder the commit lands in, so CI rarely goes red.
- **Agent merging** ([`scripts/can-merge.ts`](../scripts/can-merge.ts), decision record [0008](adr/0008-agents-merge-two-way-doors.md)) lets Claude Code merge its own tiny and normal PRs. Claude runs it from the main checkout, and it refuses when its own code there differs from `origin/main`. Its switch, `.claude/agent-merge.json`, is read from `origin/main`, never the working copy, and is on the risky list, so only a PR Jasper merges can turn merging on or off. The risky list is one file, [`scripts/risky-paths.ts`](../scripts/risky-paths.ts), and a PR that touches a path on it is Jasper's, whatever its tier says. The changed files come from the PR's head commit itself. `check` and `smoke` count only from their workflows, and `Vercel` only from a status that links to vercel.com. The merge runs `gh pr merge --merge --match-head-commit <sha>`, so only the commit that was checked can land, and writes "Merged by Claude Code (npm run can-merge)." into the merge commit. A revert on main of a commit marked that way, or of a commit it brought in, since `enabledSince`, stops agent merging until Jasper sets a later date. `gh` runs as Jasper, so GitHub shows him as the merger. The `merged-by-claude` label and the comment are for people reading the PR; the marker is the record, since a label can be changed by anyone with access. Claude's deny rules block editing the switch and running `gh pr merge` directly, so Claude merges only through `can-merge`. Jasper can still merge from GitHub. All of this stops mistakes, not an agent set on getting around it, since `gh` runs with Jasper's credentials. GitHub's ruleset stays the lock, and a revert of a Claude merge switches merging off. A GitHub Action that merges with main's gate code, so the agent never holds merge rights, is the stronger option, left out for now.
- **Project lint rules** in [`eslint-rules/turnpoint.mjs`](../eslint-rules/turnpoint.mjs) check three rules from `CLAUDE.md` in `npm run lint`, so they run on every commit and in CI: Riot API hosts appear only in `src/lib/riot/`, a file in `src/lib/` or `src/db/` that reads a secret env var imports `"server-only"`, and no green, emerald or lime color classes. Their tests run in `npm test`. A mistake caught twice becomes a check like these (a lint rule, a test or a hook) rather than another line of instructions.
- **Dependency review** ([`.github/workflows/dependency-review.yml`](../.github/workflows/dependency-review.yml)) fails a PR that adds a package version with a known vulnerability. It isn't a required check yet.
- **The accessibility scan** ([`e2e/accessibility.spec.ts`](../e2e/accessibility.spec.ts)) runs with the smoke test on each preview and lists what axe finds on the run's summary page. Any finding fails the smoke test, so a PR can't add one to the pages it visits (`FAIL_ON_FINDINGS` in the spec).
- **Golden tests** ([`src/lib/analyzer/golden.test.ts`](../src/lib/analyzer/golden.test.ts)) run the analyzer on four real, anonymized games inside `npm test`. If a change moves the gold leads or the turning points it finds in those games, CI fails until someone checks the new values make sense and updates them.
