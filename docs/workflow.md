# How a change gets made

Claude Code, on Opus 5.5, writes every change to this app. This page is the loop around it: where work waits, how much review it gets, who merges, and what "done" means. [CLAUDE.md](../CLAUDE.md) has the short rules. Why the loop changed on 2026-10-28 is in [decision record 0012](adr/0012-claude-only-workflow.md).

## Tickets and builders

Work lives in Linear ([linear.app/jaspy](https://linear.app/jaspy), team JAS, project Turnpoint), not GitHub issues. GitHub issues opened before 2026-10-25 stay open until they're done.

| Status | What it means | Who moves it there |
|---|---|---|
| Backlog | An idea, not written up yet | Anyone |
| Todo | Written up with the [Feature or fix](../.github/ISSUE_TEMPLATE/feature.md) sections; a builder starts it only when Jasper asks | Claude or Jasper |
| Ready | Jasper approved it, so a builder may take it without being asked. A later `/run-queue` skill will hand these to cloud sessions | Jasper |
| In Progress | A builder posted its start comment and plan | The builder |
| In Review | The PR is open | The builder |
| Done | The PR merged | Linear, from the ticket ID in the branch name |

- **Claude Code is the only builder**, in a local session on Jasper's PC or a cloud session in the `League-Web-App` environment. One ticket has one builder: the one whose start comment came first.
- **Up to 4 branches at once**, each touching different files. A file another open PR already changes waits for that PR, or the change goes into it.
- **Branch:** `claude/jas-<n>-<short-name>`. Linear links a PR by its branch name, not its description, and `npm run can-merge` takes only branches that start with `claude/`. Tiny changes need no ticket.
- **Comments:** the builder comments on its ticket when it starts (branch and plan), when it opens the PR (link), and at the end of each session (done, next, blocked). After posting its start comment and moving the ticket to In Progress, a builder reads the ticket again; if an earlier start comment is there, that builder owns it, so this one deletes its own comment and stops.
- **A cloud session** starts from a pushed branch, usually `origin/main`, and can't see uncommitted work on Jasper's PC. Its startup hook ([`cloud-setup.mjs`](../.claude/hooks/cloud-setup.mjs)) runs `npm ci` and `npx playwright install chromium`, and does nothing in a local session. GitHub's GraphQL API is blocked there, so no `gh pr` or `gh issue` command works: until JAS-26, a cloud session pushes its branch and stops, and a local session opens the PR, runs the reviews and merges.

## Review tiers

The builder picks a tier when it starts and names it in the PR. Every tier gets the same automatic checks; the higher tiers add review and Jasper's time. A PR that touches a path on the risky list is Jasper's to merge, whatever its tier says. So is every PR Claude Code didn't build, such as Dependabot's. Rules for one area of the code are in [`.claude/rules/`](../.claude/rules/).

| Tier | What counts | Review | Who merges |
|---|---|---|---|
| Tiny | Copy, styling inside one component, docs, Dependabot's minor and patch bumps | Commit hook, CI, smoke test and accessibility scan. Plus the reviewer agent unless it changes only docs: the `.md` and image files in `docs/`, `README.md` and `ARCHITECTURE.md`, never this file, a `CLAUDE` or `AGENTS` file or a dot folder | Claude, with `can-merge`, for its own PRs off the [risky list](../scripts/risky-paths.ts). Jasper merges Dependabot's |
| Normal | A feature or fix inside one area; a Dependabot major bump; a change in `.github/` or `.claude/` that adds or tightens a check | Tiny's, plus the [reviewer agent](../.claude/agents/reviewer.md) and a screenshot or test name per criterion | Claude, with `can-merge`, for its own PRs off the risky list once the reviewer finds no blockers. Jasper merges the rest, such as a `.github/` or `.claude/` change on the risky list |
| Risky | Database code (`src/db/`, `drizzle/`, the stores in `src/lib/`, scripts that use the live database), sign-in, the Riot client, `src/app/api/`, server actions, the MCP server, Claude API spending, model retraining, a new judgment shown to players, Riot policy, anything that removes or loosens a check | Normal's, plus a pstack `interrogate` panel, a draft [decision record](#decision-records-and-done) and Jasper's own test of the preview | Jasper, after `/explain-back` |

## The steps for a normal change

1. **Frame.** The ticket has the player problem in one sentence, 3 to 5 acceptance criteria, what's out of scope, the tier and the builder.
2. **Inspect.** Read the code and docs it will touch, name the files, and check open PRs for overlap.
3. **Plan.** Post a short plan on the ticket. Normal changes go ahead unless Jasper objects; risky ones wait for his yes.
4. **Test first** where the logic is pure. Analyzer changes start with a failing test written from the criteria.
5. **Implement** in small commits on the ticket's branch.
6. **Automatic checks.** The commit hook, then CI (lint, types, tests with the golden games, build, dependency review), then the smoke test and accessibility scan on the Vercel preview.
7. **Self-check.** One screenshot of the preview per criterion with the [`verify` skill](../.claude/skills/verify/SKILL.md) (`npm run shot`), or the name of the test that shows it. A criterion that needs a click gets a journey from `verify-turnpoint` or `verify-turnpoint-ux`.
8. **Review.** Start the reviewer agent once your own checks pass. Start every other pass you run on the same head commit too, such as the `interrogate` panel on a risky PR or a security check, so one fix round answers them all.
9. **Triage.** Fix what you can reproduce, reject the rest with evidence, and bring real disagreements to Jasper (below). New commits need a new review of the new head.
10. **Merge.** Claude merges its own tiny and normal PRs with `npm run can-merge -- <pr> --merge`, run from an up-to-date main checkout. It merges only when every gate in [`scripts/can-merge-gates.ts`](../scripts/can-merge-gates.ts) passes at the head commit ([0008](adr/0008-agents-merge-two-way-doors.md), [0009](adr/0009-can-merge-covers-database-code-and-tiny-code.md)); a normal PR also needs every criterion ticked. Wait for the `reviewer` check to finish first, since `can-merge` refuses while any check runs. GitHub doesn't run that check while the PR has a merge conflict. Jasper merges the rest.
11. **Close out in the same PR.** Docs and decision records change with the code; a doc the PR leaves wrong gets fixed in it. The branch's ticket ID closes the ticket on merge.

## Reviews

- **The reviewer agent** ([`reviewer.md`](../.claude/agents/reviewer.md)) is a fresh Claude on Fable with no Edit or Write tool, told never to change files. It gets the criteria, the test output and the PR number, never the builder's reasoning. Its first line, `Reviewer agent at <sha>: no blockers` or `<n> blockers`, goes into the PR's first `## Review` section, where `can-merge` and GitHub's required `reviewer` check read it ([0010](adr/0010-github-requires-the-reviewer.md)). On a PR Claude didn't build, Claude runs the reviewer and writes that section itself.
- **Re-reviews:** after a fix round that only answers the reviewer's findings, the next review can cover just the new commits ([0011](adr/0011-shorter-re-reviews.md)). Any other review at or after that commit, such as `interrogate`, makes it a full one, and so does a fix for something the builder found itself. A review of an older commit written in after a later review ran isn't caught that way, so the builder asks for a full review next. The exact conditions for a shorter one are in `reviewer.md`. A security check runs again when fix commits touch secrets, sign-in, `src/app/api/` or user input.
- **The `interrogate` panel** (pstack) is the second look on risky PRs: several models challenge the diff from different angles. It runs once per risky PR, on the first commit that passes the checks. After fixes, only the reviewer agent checks the new commits; a second panel runs only when Jasper asks, such as when a fix changes the design. The builder records it as `Interrogate panel at <sha>: <n> to act on`, counting the findings the panel's lead put under "Act on", on its own line. If it can't run, such as when pstack won't load, the PR says "no interrogate panel yet".
- **Recording:** every review gets its own `<name> at <sha>:` line, even with no findings, and each finding is marked fixed (with its test) or rejected (with evidence). Only review lines use that shape, and only the reviewer agent writes "Reviewer agent at". To run the `reviewer` check again, edit the description: GitHub's Re-run button reads the old one and can bring back an old result.
- **Disagreements:** a finding without a concrete failing case is dropped. Otherwise the builder reproduces and fixes it, or rejects it with evidence. After one more round it goes to Jasper as the claim and the evidence on each side. A failing test beats an argument; with no test either way, risky paths take the safer behavior.
- **"My read"** closes every normal and risky PR: three to five sentences Jasper writes when he chooses. It isn't a merge gate, and Claude never writes it. On risky PRs Jasper first runs `/explain-back <pr>` ([skill](../.claude/skills/explain-back/SKILL.md)): three questions, one at a time, then what he got right and missed. Claude starts it only when he asks.

## pstack

pstack is a Claude Code plugin on Jasper's PC, not a file in this repo, so a cloud session doesn't have it. It doesn't update itself: run `claude plugin marketplace update pstack-claude`, then `claude plugin update pstack@pstack-claude`, and restart Claude Code. The repo's own skills in [`.claude/skills/`](../.claude/skills/) load everywhere, cloud included: `explain-back`, the three `verify` skills, `soft-rounded-ux`, and general ones copied from other repos ([notices](../.claude/skills/THIRD-PARTY-NOTICES.md)). pstack's session hook sends a task that touches several files, needs a design choice, or is a bug with an unknown cause to its `poteto-mode` skill, which picks a playbook. Where pstack disagrees with this page or `CLAUDE.md`, the repo wins.

| Step | pstack playbook or skill | What this repo changes |
|---|---|---|
| 2 to 5, 7 | Feature: `how` maps the code, `architect` compares designs, a subagent writes the code in its own worktree, then the result is checked. Bug fix: reproduce, rule out causes with evidence, land the failing test before the fix | The code that lands is written on Opus 5.5, whatever pstack's role map says |
| 8 | `interrogate` on risky PRs | Its line goes in the Review section |
| Opening the PR | Small ordered commits, `/deslop` and `/no-comments` on the diff, PR opened ready | The description follows the [PR template](../.github/pull_request_template.md) |
| 9 and 10 | Babysit (conflicts, then review threads, then CI, until the PR can merge), then Shipping | The merge is `npm run can-merge`, since the deny rules block `gh pr merge` |
| Any | Autonomous run ("keep going until X"), woken by `/loop` | The tiers still hold, so a risky plan waits for Jasper |

## Jobs on Jasper's PC and guard rails

- **Jobs:** every 30 minutes a scheduled task pulls `main`, only when that folder is on `main` with nothing uncommitted, and then deletes local branches already merged except ones a worktree has open. After each pull, a git hook rebuilds the notes in his private Obsidian vault from the merged PRs. Daily, a task copies new unresolved Sentry issues into the error inbox in the vault's Bug Log.
- **GitHub is the lock:** `main` takes only PRs, needs `check`, `Vercel` and `reviewer` to pass from the apps that run them, and blocks force pushes, with nobody on the bypass list. Claude's deny rules ([`.claude/settings.json`](../.claude/settings.json)) block reading `.env.local`, force pushes, `gh pr merge` and editing the merge switch; they catch mistakes and aren't a security boundary.
- **Checks in code:** the commit hook runs lint and typecheck before Claude's commits. The [project lint rules](../eslint-rules/turnpoint.mjs) keep Riot hosts in `src/lib/riot/`, `"server-only"` on files that read secrets, and green out of the UI. The golden tests fail CI when the analyzer's results on four real games move. A mistake caught twice becomes a check like these, not another line of instructions.

## Decision records and done

A decision record is a one-page note in `docs/adr/` on a big choice: Context, Options considered, Decision, Consequences, and "In my words", which Jasper writes. A merged record isn't edited; a new one that replaces or changes it names the old ones in its Status line. 0001 to 0004 are saved for Jasper. **Done** means merged (CI green and deployed), verified (every criterion has evidence) and, later, validated (three players used it and Jasper recorded what they said).
