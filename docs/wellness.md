# Codebase wellness check

Every two weeks, a health check of Turnpoint's code: its architecture, the quality of what merged lately, how fast the tests and build run, and code nothing uses anymore. It finds problems and files tickets; it doesn't fix anything. Fixes go through the normal steps in [workflow.md](workflow.md).

## How it runs

One Claude Code routine runs the automatic part in the cloud, so Jasper doesn't have to be at the computer.

1. **The cloud run** (a routine on the 1st and 15th of each month at 14:00 UTC, 9 or 10 in the morning in Toronto). A cloud session on `origin/main` runs checks 1, 3 and 4 below, files their tickets, adds a row to Runs on a branch named `claude/wellness-<date>`, opens the pull request and merges it with `can-merge`. All of that works over GitHub's REST API, which cloud sessions can reach ([AGENTS.md](../AGENTS.md#cloud-sessions)). Last, it files a ticket asking Jasper to run check 2.
2. **Jasper** sees that ticket, types `/improve-codebase-architecture` in a local session (Claude can't start that skill itself), picks a candidate from its report, and moves any ticket he wants done from Backlog to Ready.

If the run can't merge (a gate fails, or Linear's tools didn't work), it leaves the pull request open with a comment saying why, for Jasper.

To run the whole check by hand instead, open a local session on an up-to-date `main` and say "run the wellness check in docs/wellness.md".

## Rules for every run

- **Read-only.** Change no code. The only file a run edits is the Runs table at the bottom of this page. Check 2 is the exception: its skill may add words to `GLOSSARY.md` or offer a decision record, and those go through a normal PR of their own, not the Runs-row PR.
- **Scope.** The changes since the commit in the last row of Runs: `git diff <that commit>..origin/main`. With no rows yet, the base is the last commit from before 14 days ago. `npx tsx scripts/wellness.ts` works both out and prints the range.
- **Evidence or drop it.** Every finding names a file and line, or quotes command output. A finding without a concrete case is dropped, the same rule reviews follow.
- **Tickets.** Each finding worth fixing becomes a Linear ticket in team JAS, project Turnpoint, status Backlog, titled `Wellness: <what>`, with the evidence, a suggested tier and the skill to fix it with. Search open tickets first, and add to a matching one instead of making a duplicate. Never move a ticket to Ready; that's Jasper's call. If Linear's tools don't work in the cloud run, it lists each ticket to file under "Tickets to file" in the pull request's description and leaves the pull request open, so Jasper files them.
- **No new packages.** A check that would need one says so in the report instead.

## The checks

| # | Check | Skill | Looks at | Output | Run by |
|---|---|---|---|---|---|
| 1 | Quality and bugs in recent changes | `thermos` (pstack), which runs the `thermo-nuclear-code-quality-review-subagent` and `thermo-nuclear-review-subagent` agents side by side | The diff in scope | One merged list of findings, most serious first | Cloud run |
| 2 | Architecture | `/improve-codebase-architecture` (Matt Pocock), which uses `codebase-design`, [`GLOSSARY.md`](../GLOSSARY.md) and the [decision records](adr/) | The whole codebase, weighted toward the files that changed most lately | An HTML report in the temp folder. Jasper picks one candidate, and it becomes a ticket | Jasper, from the run's reminder ticket |
| 3 | Speed | `benchmark-checklist` (pstack), before any number goes in the report | How long `npm test` and `npm run build` take, next to the last run from the same place (cloud or local), from `npx tsx scripts/wellness.ts`. If Sentry's tools are connected, the slowest pages and API routes over the last 14 days | The numbers, and a ticket for `poteto-mode`'s "Perf issue" playbook if something got clearly slower | Cloud run |
| 4 | Unused code | `principle-subtract-before-you-add` (pstack) | The variables and parameters nothing reads, from the same script (`tsc --noUnusedLocals --noUnusedParameters`). Unused files, exports and packages need a tool the repo doesn't have yet, such as `knip`, so ask Jasper before running one | The list, as one ticket | Cloud run |

`npx tsx scripts/wellness.ts` does the mechanical part of checks 3 and 4: it times the tests and the build, runs the unused-code scan, and prints a report ending in the Runs row to add. It changes no tracked file and keeps a copy of the report in the git-ignored `.cache/wellness/`. Times depend on the machine (a cloud machine starts with no build cache), so the row says where the run happened, and the report compares only with the last run from the same place.

## After the checks

- **Commit and push.** The cloud run adds the script's Runs row with the ticket numbers filled in, commits it on `claude/wellness-<date>`, and pushes.
- **Pull request.** It opens the pull request with `gh api -X POST repos/Jaspyplayz/League-Web-App/pulls`. The description follows `.github/pull_request_template.md`, starting with a `**Tier:** tiny` line and a `**Builder:**` line, because `can-merge` refuses a PR without them; the report goes under its walkthrough. A row is a docs-only change, so the pull request skips the reviewer.
- **Merge.** Once every check at the head commit has finished, it runs `npm run can-merge -- <pr> --merge` from a checkout of `origin/main`. If a gate fails, it merges nothing and comments the reason on the pull request.
- **Check 2.** It files a ticket assigned to Jasper, `Wellness: run check 2 for <date>`, in Backlog, asking him to type `/improve-codebase-architecture`.

## The routine's prompt

The routine ([Turnpoint wellness check](https://claude.ai/code/routines/trig_01RSwL42bddgPraDGkxgNUUu)) runs the prompt below. Change both together: edit it here in a pull request, then paste the merged version into the routine.

```text
You are running Turnpoint's biweekly codebase wellness check in the repo Jaspyplayz/League-Web-App, in a Claude Code cloud session. Nobody is watching, so never stop to ask a question: if something blocks you, say so in the pull request (or in your final summary if there is none) and carry on.

First read docs/wellness.md, CLAUDE.md and AGENTS.md (its "Cloud sessions" section). docs/wellness.md is the source of truth: where it and this prompt disagree, the page wins. You run checks 1, 3 and 4; check 2 is Jasper's.

GitHub's GraphQL API is blocked here, so never use `gh pr` or `gh issue`. Use `gh api` (GitHub's REST API) for everything on GitHub.

Steps:
1. DATE=$(TZ=America/Toronto date +%F). git fetch origin, then git checkout -B claude/wellness-$DATE origin/main.
2. Run `npx tsx scripts/wellness.ts` and keep its whole output. It prints the commit range, the test and build times next to the last run from the same place, the unused-code list, and the Runs row to add. If `npm run build` shows "failed", quote the error lines from the script's output.
3. Check 1: use the `thermos` skill (copied into .claude/skills) on `git diff <base>..<head>`, with base and head from the script's Range line. Keep only findings with a concrete file:line or quoted output.
4. Check 3: use the `benchmark-checklist` skill on the two times before judging them. Say whether anything got clearly slower; with no earlier cloud run, say so and judge nothing. If the Sentry tools work, add the slowest pages and API routes over the last 14 days; only read from Sentry, never change anything there.
5. Check 4: judge the unused-code list with `principle-subtract-before-you-add`.
6. Tickets: for each finding worth fixing, make a Linear ticket with the Linear tools: team Jaspy (key JAS), project Turnpoint, status Backlog, title `Wellness: <what>`, with the evidence, a suggested tier (tiny, normal or risky as docs/workflow.md defines them) and the skill to fix it with. Group all unused-code items into one ticket. Search open tickets first and comment on a matching one instead of making a duplicate. Never move a ticket out of Backlog and never add labels. If the Linear tools don't work, list each ticket under a "Tickets to file" heading in the pull request's description instead, and don't merge in step 12.
7. Add the script's Runs row as the last row of the Runs table at the bottom of docs/wellness.md. Tickets column: the ticket ids (like JAS-41, JAS-42), or `pending` if they are waiting under "Tickets to file", or `none`. Notes: a few words, no pipe characters. Change no other file.
8. Commit only docs/wellness.md. Message: first line `Wellness run $DATE`, a blank line, then the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. The commit hook runs lint and typecheck; if it blocks, change no code, and explain the block in your final summary.
9. git push -u origin claude/wellness-$DATE.
10. Write the pull request's description to .cache/wellness/pr-body.md (git-ignored), in the sections of .github/pull_request_template.md:
   - First line `**Tier:** tiny: one Runs row in docs/wellness.md.`, second line `**Builder:** Claude Code on Opus 5.5, in a cloud session.`
   - Walkthrough: the report: the script's output, check 1's findings (most serious first), check 3's judgment, check 4's judgment, and the tickets made (or "Tickets to file").
   - Acceptance criteria: "None: a tiny PR."
   - Tested: the script's command and its result. Not tested: what you couldn't run.
   - Review: "A tiny PR that changes only docs skips the reviewer."
   - Docs and decisions touched: docs/wellness.md (the Runs row).
   - Last line: `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
   Then open it: gh api -X POST repos/Jaspyplayz/League-Web-App/pulls -f title="Wellness run $DATE" -f head=claude/wellness-$DATE -f base=main -F body=@.cache/wellness/pr-body.md --jq .number
11. Wait for the checks at the head commit: every 30 seconds, run gh api repos/Jaspyplayz/League-Web-App/commits/$(git rev-parse HEAD)/check-runs --jq '.check_runs[] | [.name,.status,.conclusion] | @tsv' until no check is queued or in_progress, for up to 20 minutes.
12. Merge: git fetch origin, git checkout -B main origin/main, then npm run can-merge -- <number> --merge. Merge only this way, never with GitHub's merge API directly. Skip this step if tickets are waiting under "Tickets to file". If you skip it or a gate fails, write the reason (with can-merge's output) to .cache/wellness/comment.md, post it with gh api -X POST repos/Jaspyplayz/League-Web-App/issues/<number>/comments -F body=@.cache/wellness/comment.md, and leave the pull request open for Jasper.
13. Check 2 reminder: with the Linear tools, make a ticket in team Jaspy (key JAS), project Turnpoint, status Backlog, assigned to Jasper (the account the Linear tools act as), titled `Wellness: run check 2 for $DATE`. Its description: type `/improve-codebase-architecture` in a local session on an up-to-date main, pick one candidate from its report, and turn it into a ticket; link the pull request. Skip this if the Linear tools don't work.

Never change code, never push to main, never force-push, never run npm run db:migrate, never add a package. End your session with a short summary: the pull request's number, whether it merged, and the tickets made or waiting.
```

## Runs

| Date | Ran in | Checked up to | Tickets | `npm test` | `npm run build` | Notes |
|---|---|---|---|---|---|---|
| 2026-10-29 | cloud | `0e76a79` | JAS-39, JAS-40, JAS-41, JAS-42, JAS-43, JAS-44, JAS-45, JAS-46, JAS-47, JAS-48, JAS-49, JAS-50 | 20 s | 33 s | First run. Build time is the cold first run, a warm rerun took 8 s. Clone was shallow (JAS-45) |
