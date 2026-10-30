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
- **A cloud session** starts from a pushed branch, usually `origin/main`, and can't see uncommitted work on Jasper's PC. Its startup hook ([`cloud-setup.mjs`](../.claude/hooks/cloud-setup.mjs)) runs `npm ci` and `npx playwright install chromium`, and does nothing in a local session. GitHub's GraphQL API is blocked there, so no `gh pr` or `gh issue` command works. `npm run can-merge` and `npm run shot -- --pr` use GitHub's REST API instead, so that block doesn't stop them ([0013](adr/0013-can-merge-uses-github-rest.md)). Opening a PR and commenting on it work over REST too (`gh api -X POST`): a cloud session opened, waited on and merged PR 204 that way. So a cloud session can finish its own tiny docs-only PR, as PR 204 did. Writing the Review section means editing the description with `gh api -X PATCH`, which hasn't been tried there yet, nor has the reviewer agent, and skills that call `gh pr`, such as `fix-ci`, need a local session.

## Review tiers

The builder picks a tier when it starts and names it in the PR. Every tier gets the same automatic checks; the higher tiers add review and Jasper's time. A PR that touches a path on the risky list is Jasper's to merge, whatever its tier says. So is a one-way door, a change a revert doesn't fully undo (the PR template's Merge Danger section says what counts), so it takes the risky tier ([0008](adr/0008-agents-merge-two-way-doors.md)). So is every PR Claude Code didn't build, such as Dependabot's. Rules for one area of the code are in [`.claude/rules/`](../.claude/rules/).

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
10. **Postmortem each agent mistake.** Each reviewer blocker the builder fixed, failed `can-merge` gate or CI check the builder caused, and correction from Jasper gets an entry in [`agent-mistakes/`](agent-mistakes/), in this PR, with the [`postmortem` skill](../.claude/skills/postmortem/SKILL.md). Run it as each one is caught; here, confirm none was missed (nothing checks this yet). The fix goes in this PR too when it's small and doesn't put the PR on the risky list; otherwise it becomes a `Postmortem:` ticket in Backlog, except a first time left at `none yet`, which gets none. An entry added after the last review is a new commit, so go back to step 8 for the new head; so does a `can-merge` refusal in step 11 that your change caused. On Jasper's PC, read the skill at that path: his older `postmortem` in `~/.claude/skills/` has the same name, and Claude Code runs a personal skill over a project one.
11. **Merge.** Claude merges its own tiny and normal PRs with `npm run can-merge -- <pr> --merge`, run from an up-to-date main checkout. It merges only when every gate in [`scripts/can-merge-gates.ts`](../scripts/can-merge-gates.ts) passes at the head commit ([0008](adr/0008-agents-merge-two-way-doors.md), [0009](adr/0009-can-merge-covers-database-code-and-tiny-code.md)); a normal PR also needs every criterion ticked. Wait for the `reviewer` check to finish first, since `can-merge` refuses while any check runs. GitHub doesn't run that check while the PR has a merge conflict. Jasper merges the rest.
12. **Close out in the same PR.** Docs and decision records change with the code; a doc the PR leaves wrong gets fixed in it. The branch's ticket ID closes the ticket on merge.

### Skills for each step

Every session has these, local or cloud: pstack's are copied into the repo ([below](#pstack)), and Matt Pocock's come from the plugin or the cloud hook ([below](#matt-pococks-skills)). Where a skill disagrees with this page, this page wins.

| Step | Skill | When |
|---|---|---|
| Before a ticket | `grill-with-docs`, then `to-spec`, then `to-tickets` (Matt Pocock) | Work too big for one PR, in a local session with Jasper. Jasper types each one, in the order [below the table](#work-too-big-for-one-pr) |
| 1. Frame | `grilling` and `domain-modeling` together (Matt Pocock), what `/grill-with-docs` runs | The problem or the criteria are unclear, in a local session where Jasper can answer. New words go into [`GLOSSARY.md`](../GLOSSARY.md) and decisions into [records](#decision-records-and-done) as they settle, not only into the chat. Claude can start both; only Jasper can type `/grill-with-docs`. A cloud session posts its questions on the ticket as blocked instead |
| 1. Frame | `grilling` alone (Matt Pocock) | A question outside the code, such as how the workflow should run, where there's nothing to write into the glossary or a record |
| 1. Frame | `to-tickets` (Matt Pocock) | The ticket is bigger than one PR. The builder stops before coding, comments a proposed split on the ticket, deletes its own start comment so it no longer owns the ticket, moves it back to Todo, and asks Jasper to run `/to-tickets` on it, as [below the table](#work-too-big-for-one-pr) |
| 2. Inspect | `how` (pstack) | Before changing a part you haven't read |
| 3. Plan | `architect` (pstack) or `codebase-design` (Matt Pocock) | A design choice, or where a module's boundary should go |
| 3. Plan | `domain-modeling` (Matt Pocock) | The change adds or renames a word in [`GLOSSARY.md`](../GLOSSARY.md), or records a decision about those words, in this repo's [record format](#decision-records-and-done) |
| 4. Test first | `tdd` (pstack) | Pure logic, and any bug fix with a cheap test |
| 5. Implement | `poteto-mode` (pstack) | Several files, a design choice, or a bug or slowdown whose cause isn't known. It picks a playbook |
| 5. Implement | `why` (pstack) | Why code works the way it does, or when it broke. `poteto-mode`'s bug playbook calls it for you |
| 7. Self-check | `verify`, `verify-turnpoint`, `verify-turnpoint-ux` | As in step 7 |
| 8. Review | the reviewer agent, plus `interrogate` (pstack) on risky PRs | As in step 8 |
| 10. Postmortem | `postmortem` (this repo's) | Each agent mistake, as it's caught. `correct` (pstack) is the sweep of the whole repo for repeated mistakes, on the same ladder |
| 9. Triage, 11. Merge | `fix-merge-conflicts`, then `fix-ci` (pstack) | A conflict with `main` (GitHub won't run the checks until it's gone), then a failing check. `fix-ci` reads checks with `gh pr`, so it works only in a local session |
| 12. Close out | `documentation-and-adrs` (copied in) | A decision record in this repo's [format](#decision-records-and-done), such as a risky PR's draft, or a doc the change makes wrong |
| PR text | `unslop` (pstack) | Before opening the PR |

#### Work too big for one PR

Three of Matt Pocock's skills turn it into tickets before any builder starts. Claude can't start them itself, so Jasper types each one, in a local session:

1. **`/grill-with-docs`** questions Jasper until the plan is settled. It writes new words into [`GLOSSARY.md`](../GLOSSARY.md) and decisions into [decision records](#decision-records-and-done) as they settle, since it runs `grilling` and `domain-modeling` together.
2. **`/to-spec`** writes what was decided up as one parent ticket. Its only question is whether the places it plans to test match what Jasper expects. The parent keeps the skill's own sections instead of the Feature or fix ones, because it's a plan for the sub-tickets and no PR builds it.
3. **`/to-tickets JAS-<n>`**, given that ticket, splits it into slices, checks the split with Jasper, and saves each slice as a sub-ticket, joined by Linear's blocking links. Two of this repo's rules override the skill's: each slice fits one PR (the skill sizes them to one Claude session), and each sub-ticket has the [Feature or fix](../.github/ISSUE_TEMPLATE/feature.md) sections, so it counts as written up in Todo.

Every ticket they make stays in Todo for Jasper to move to Ready ([triage roles](agents/triage-labels.md)). Each sub-ticket is then built like any other, but only after the tickets that block it are Done. The parent ticket stays in Todo until the last sub-ticket's PR merges; whoever merges that PR moves the parent to Done: the builder after `can-merge`, or Jasper when the PR is his to merge.

Outside a ticket: Jasper types `/improve-codebase-architecture` (Matt Pocock) to scan the code for modules worth deepening, then picks one to go through; what comes out becomes tickets. For slow code, `poteto-mode` has a playbook for one measured slowdown and one for improving a number step by step, and `benchmark-checklist` (pstack) checks a measurement before anyone acts on it.

## Reviews

- **The reviewer agent** ([`reviewer.md`](../.claude/agents/reviewer.md)) is a fresh Claude on Fable with no Edit or Write tool, told never to change files. It gets the criteria, the test output and the PR number, never the builder's reasoning. Its first line, `Reviewer agent at <sha>: no blockers` or `<n> blockers`, goes into the PR's first `## Review` section, where `can-merge` and GitHub's required `reviewer` check read it ([0010](adr/0010-github-requires-the-reviewer.md)). On a PR Claude didn't build, Claude runs the reviewer and writes that section itself.
- **Re-reviews:** after a fix round that only answers the reviewer's findings, the next review can cover just the new commits ([0011](adr/0011-shorter-re-reviews.md)). Any other review at or after that commit, such as `interrogate`, makes it a full one, and so does a fix for something the builder found itself. A review of an older commit written in after a later review ran isn't caught that way, so the builder asks for a full review next. The exact conditions for a shorter one are in `reviewer.md`. A security check runs again when fix commits touch secrets, sign-in, `src/app/api/` or user input.
- **The `interrogate` panel** (pstack) is the second look on risky PRs: several models challenge the diff from different angles. It runs once per risky PR, on the first commit that passes the checks. After fixes, only the reviewer agent checks the new commits; a second panel runs only when Jasper asks, such as when a fix changes the design. The builder records it as `Interrogate panel at <sha>: <n> to act on`, counting the findings the panel's lead put under "Act on", on its own line. If it can't run, such as when pstack won't load, the PR says "no interrogate panel yet".
- **Recording:** every review gets its own `<name> at <sha>:` line, even with no findings, and each finding is marked fixed (with its test) or rejected (with evidence). Only review lines use that shape, and only the reviewer agent writes "Reviewer agent at". To run the `reviewer` check again, edit the description: GitHub's Re-run button reads the old one and can bring back an old result.
- **Disagreements:** a finding without a concrete failing case is dropped. Otherwise the builder reproduces and fixes it, or rejects it with evidence. After one more round it goes to Jasper as the claim and the evidence on each side. A failing test beats an argument; with no test either way, risky paths take the safer behavior.
- **`/explain-back`:** on risky PRs Jasper runs `/explain-back <pr>` before he merges ([skill](../.claude/skills/explain-back/SKILL.md)): three questions, one at a time, then what he got right and missed. Claude starts it only when he asks.

## pstack

pstack lives in this repo, pinned to version 0.9.102 ([0014](adr/0014-pstack-lives-in-the-repo.md)). Its 65 skills are in [`.claude/skills/`](../.claude/skills/) and its 4 agents in [`.claude/agents/`](../.claude/agents/), copied unchanged from the Claude Code port, so local and cloud sessions load the same copy. Cloud sessions can't install plugins, which is why it's copied. `.claude/settings.json` switches the pstack plugin off for this project only, so each skill loads once; Jasper's other projects keep the plugin. Copied in, the names lose their `pstack:` prefix: `pstack:how` is `how`, and `pstack:poteto-agent` is the `poteto-agent` agent. [`pstack-manifest.txt`](../.claude/skills/pstack-manifest.txt) lists every copied file with the Git hash pstack's repo gives it, and a test fails if one is edited. The startup hook [`pstack-context.mjs`](../.claude/hooks/pstack-context.mjs) prints pstack's own startup text, which sends a task that touches several files, needs a design choice, or is a bug with an unknown cause to `poteto-mode`, which picks a playbook. After it, the hook adds a note that overrides pstack's files where the plugin's names and paths don't work here, and gives the path a `poteto-agent` should read. Like the plugin's hook, it stays quiet when `~/.claude/pstack-models.md` says `session hook: off`. That file on Jasper's PC sets each pstack role's model; a cloud session has no copy, so it uses each skill's built-in defaults. The repo's other skills load everywhere too: `explain-back`, `postmortem`, the three `verify` skills, `soft-rounded-ux`, and general ones copied from other repos ([notices](../.claude/skills/THIRD-PARTY-NOTICES.md)). Where pstack disagrees with this page or `CLAUDE.md`, the repo wins.

**Updating pstack** is a risky PR of its own, since `.claude/skills/`, `.claude/agents/` and `.claude/hooks/` are on the risky list:

1. Get the new version on Jasper's PC: `claude plugin marketplace update pstack-claude`, then `claude plugin update pstack@pstack-claude`. The plugin lands in `~/.claude/plugins/cache/pstack-claude/pstack/<version>/`, and pstack's own Git clone, at `~/.claude/plugins/marketplaces/pstack-claude`, moves to the new commit.
2. Delete the old copy first, so a file the new version dropped doesn't stay behind: every path listed in `.claude/skills/pstack-manifest.txt`.
3. Copy the new version's `skills/*` folders into `.claude/skills/`, its `agents/*.md` into `.claude/agents/`, and its `hooks/session-start-context.md` over `.claude/hooks/pstack-session-start-context.md`. If a new name matches one of the repo's own skills or the `reviewer` agent, stop and ask Jasper.
4. Write the manifest again from pstack's clone, keeping its comment lines at the top: run `git ls-tree -r <commit> plugins/pstack/skills plugins/pstack/agents plugins/pstack/hooks/session-start-context.md` there, and turn each line into `<mode> <hash> <path here>`, with `plugins/pstack/skills/` becoming `.claude/skills/`, `plugins/pstack/agents/` becoming `.claude/agents/`, and the hook file becoming `.claude/hooks/pstack-session-start-context.md`. Then `git add` the copy and mark as runnable each file the manifest lists with mode `100755`: `git update-index --chmod=+x <path>`, since Git on Windows doesn't see that bit. `npm test` runs `.claude/skills/pstack-manifest.test.mjs`, which passes only when every copied file matches.
5. Compare the plugin's `hooks/session-start.sh`, `hooks/hooks.json` and `skills/setup-pstack/scripts/read-sheet.sh` with the old version's. [`pstack-context.mjs`](../.claude/hooks/pstack-context.mjs) copies what they do (when the hook runs, and how it reads `session hook: off`), so if they changed, change it and its test to match. Check its note against the new files too: the agent names, and the plugin-cache search in `agents/poteto-agent.md`.
6. Change the version and the counts wherever they're written: pstack's row in [`THIRD-PARTY-NOTICES.md`](../.claude/skills/THIRD-PARTY-NOTICES.md) (version, commit, and the copyright holders if `poteto-mode/references/licenses/` changed), the manifest's first line, this section, `CLAUDE.md`'s Skills line and `ARCHITECTURE.md`'s `.claude/` line.
7. Run lint, typecheck and the tests. They skip pstack's code in `poteto-mode/scripts/`, because pstack tests it with Bun. If a new version puts code somewhere else and a check fails on it, add that folder to the skip lists in `eslint.config.mjs`, `tsconfig.json` and `vitest.config.mts` in the same PR, and say so in the PR.

| Step | pstack playbook or skill | What this repo changes |
|---|---|---|
| 2 to 5, 7 | Feature: `how` maps the code, `architect` compares designs, a subagent writes the code in its own worktree, then the result is checked. Bug fix: reproduce, rule out causes with evidence, land the failing test before the fix | The code that lands is written on Opus 5.5, whatever pstack's role map says |
| 8 | `interrogate` on risky PRs | Its line goes in the Review section |
| Opening the PR | Small ordered commits, `/deslop` and `/no-comments` on the diff, PR opened ready | The description follows the [PR template](../.github/pull_request_template.md) |
| 9 to 11 | Babysit (conflicts, then review threads, then CI, until the PR can merge), then Shipping | Step 10, the postmortem, is this repo's own and comes before Shipping. The merge is `npm run can-merge`, since the deny rules block `gh pr merge` and the REST merge request |
| Any | Autonomous run ("keep going until X"), woken by `/loop` | The tiers still hold, so a risky plan waits for Jasper |

## Matt Pocock's skills

On Jasper's PC, Matt Pocock's skills (`grilling`, `to-tickets`, `domain-modeling` and more) come from the plugin `mattpocock-skills@claude-plugins-official`, which updates itself from Anthropic's official marketplace. Cloud sessions can't install plugins, so the startup hook [`pocock-skills.mjs`](../.claude/hooks/pocock-skills.mjs) downloads them instead, only in the cloud ([0015](adr/0015-cloud-sessions-get-pocock-skills-at-anthropics-pin.md)). It reads the commit Anthropic's marketplace pins for the plugin, not the newest one on GitHub, so cloud and local sessions run the same commit, and the cloud copy updates when Anthropic moves that pin. Nothing is committed: the hook fetches that one commit with git and puts the skills in the cloud machine's `~/.claude/skills/`, next to the folders the cloud keeps there, and `~/.claude/mattpocock-skills.json` records the commit so a resumed session skips the download. Their setup for this repo (the Linear tracker, triage roles as statuses, the domain docs) is in [`docs/agents/`](agents/issue-tracker.md).

- **Skipped:** any name the repo already has (today pstack's `tdd` and `teach`), and `diagnosing-bugs`, `code-review` and `pr`, which Jasper's rules replace with pstack's `why`, the reviewer agent and the PR template. The list is `SKIPPED_BY_RULE` in [`pocock-skills-steps.mjs`](../.claude/hooks/pocock-skills-steps.mjs).
- **Not used:** `implement` and `implement-spec`, which build tickets with Matt Pocock's own `tdd` and `code-review`. A builder follows [the steps above](#the-steps-for-a-normal-change) instead, one sub-ticket per PR.
- **When they appear:** on a fresh cloud machine the skills should arrive after the session's first tool call, because Claude Code reads its skill list before startup hooks finish. That order was seen on Jasper's PC; the cloud check on JAS-37 confirms it there. A resumed session has them from the start. Claude can start 7 of them itself; the other 15, such as `to-tickets`, run only when someone types the slash command, as on Jasper's PC.
- **If it fails,** the session starts anyway, and the hook's one line in Claude's context says why the skills are missing.

## Jobs on Jasper's PC and guard rails

- **Jobs:** every 30 minutes a scheduled task pulls `main`, only when that folder is on `main` with nothing uncommitted, and then deletes local branches already merged except ones a worktree has open. On each run it also removes Claude's worktrees in `.claude/worktrees/` whose last commit is a merged PR's, with their branches, unless they hold uncommitted or untracked files; files git ignores, such as `node_modules` and a copied `.env.local`, go with them. After each pull, a git hook rebuilds the notes in his private Obsidian vault from the merged PRs. Daily, a task copies new unresolved Sentry issues into the error inbox in the vault's Bug Log.
- **GitHub is the lock:** `main` takes only PRs, needs `check`, `Vercel` and `reviewer` to pass from the apps that run them, and blocks force pushes, with nobody on the bypass list. Claude's deny rules ([`.claude/settings.json`](../.claude/settings.json)) block reading `.env.local`, force pushes, `gh pr merge`, sending GitHub's REST merge request with `gh api`, and editing the merge switch; they catch mistakes and aren't a security boundary.
- **Checks in code:** the commit hook runs lint and typecheck before Claude's commits. The [project lint rules](../eslint-rules/turnpoint.mjs) keep Riot hosts in `src/lib/riot/`, `"server-only"` on files that read secrets, and green out of the UI. The golden tests fail CI when the analyzer's results on four real games move. A mistake caught twice becomes a check like these, not another line of instructions. The builder logs each agent mistake in its class's file in [`agent-mistakes/`](agent-mistakes/), listed in [agent-mistakes.md](agent-mistakes.md) next to each rule and what enforces it.

## Decision records and done

A decision record is a one-page note in `docs/adr/` on a big choice: Context, Options considered, Decision and Consequences. It has no "In my words" part ([0016](adr/0016-agent-mistakes-become-checks.md)). A record counts as a draft while its PR is open and as accepted once it merges, whatever its Status line says, so a record Claude merges is one Jasper reads in his weekly read of Claude's merged PRs. A merged record isn't edited; a new one that replaces or changes it names the old ones in its Status line. 0001 to 0004 are saved for Jasper. **Done** means merged (CI green and deployed), verified (every criterion has evidence) and, later, validated (three players used it and Jasper recorded what they said).
