# Codebase wellness check

Every two weeks, a health check of Turnpoint's code: its architecture, the quality of what merged lately, how fast the tests and build run, and code nothing uses anymore. It finds problems and files tickets; it doesn't fix anything. Fixes go through the normal steps in [workflow.md](workflow.md).

## How it runs

Two scheduled Claude Code jobs split the work, so Jasper doesn't have to be at the computer for the part that needs no one.

1. **The cloud run** (a Claude Code routine on the 1st and 15th of each month, in the morning). A cloud session on `origin/main` runs checks 1, 3 and 4 below, adds a row to Runs on a branch named `claude/wellness-<date>`, and pushes it. It puts the full report in that commit's message. A cloud session can't open a pull request ([AGENTS.md](../AGENTS.md#cloud-sessions)), so it stops there.
2. **The local follow-up** (a desktop scheduled task the same afternoon). It runs only while the Claude app is open on Jasper's PC, or at its next launch. It opens the pull request for the cloud run's branch, files any ticket the cloud run couldn't, merges the pull request, then asks Jasper to start check 2.
3. **Jasper** types `/improve-codebase-architecture` when asked (Claude can't start that skill itself), picks a candidate from its report, and moves any ticket he wants done from Backlog to Ready.

To run the whole check by hand instead, open a local session on an up-to-date `main` and say "run the wellness check in docs/wellness.md".

## Rules for every run

- **Read-only.** Change no code. The only file a run edits is the Runs table at the bottom of this page. Check 2 is the exception: its skill may add words to `GLOSSARY.md` or offer a decision record, and those go through a normal PR of their own, not the Runs-row PR.
- **Scope.** The changes since the commit in the last row of Runs: `git diff <that commit>..origin/main`. With no rows yet, the base is the last commit from before 14 days ago. `npx tsx scripts/wellness.ts` works both out and prints the range.
- **Evidence or drop it.** Every finding names a file and line, or quotes command output. A finding without a concrete case is dropped, the same rule reviews follow.
- **Tickets.** Each finding worth fixing becomes a Linear ticket in team JAS, project Turnpoint, status Backlog, titled `Wellness: <what>`, with the evidence, a suggested tier and the skill to fix it with. Search open tickets first, and add to a matching one instead of making a duplicate. Never move a ticket to Ready; that's Jasper's call. If Linear's tools don't work in the cloud run, list each ticket to file under "Tickets to file" in the commit message, and the local follow-up files them.
- **No new packages.** A check that would need one says so in the report instead.

## The checks

| # | Check | Skill | Looks at | Output | Run by |
|---|---|---|---|---|---|
| 1 | Quality and bugs in recent changes | `thermos` (pstack), which runs the `thermo-nuclear-code-quality-review-subagent` and `thermo-nuclear-review-subagent` agents side by side | The diff in scope | One merged list of findings, most serious first | Cloud run |
| 2 | Architecture | `/improve-codebase-architecture` (Matt Pocock), which uses `codebase-design`, [`GLOSSARY.md`](../GLOSSARY.md) and the [decision records](adr/) | The whole codebase, weighted toward the files that changed most lately | An HTML report in the temp folder. Jasper picks one candidate, and it becomes a ticket | Jasper, when the local follow-up asks |
| 3 | Speed | `benchmark-checklist` (pstack), before any number goes in the report | How long `npm test` and `npm run build` take, next to the last run from the same place (cloud or local), from `npx tsx scripts/wellness.ts`. If Sentry's tools are connected, the slowest pages and API routes over the last 14 days | The numbers, and a ticket for `poteto-mode`'s "Perf issue" playbook if something got clearly slower | Cloud run |
| 4 | Unused code | `principle-subtract-before-you-add` (pstack) | The variables and parameters nothing reads, from the same script (`tsc --noUnusedLocals --noUnusedParameters`). Unused files, exports and packages need a tool the repo doesn't have yet, such as `knip`, so ask Jasper before running one | The list, as one ticket | Cloud run |

`npx tsx scripts/wellness.ts` does the mechanical part of checks 3 and 4: it times the tests and the build, runs the unused-code scan, and prints a report ending in the Runs row to add. It changes no tracked file and keeps a copy of the report in the git-ignored `.cache/wellness/`. Times depend on the machine (a cloud machine starts with no build cache), so the row says where the run happened, and the report compares only with the last run from the same place.

## After the checks

- **The cloud run** adds the script's Runs row with the ticket numbers filled in (or `pending` if the local follow-up will file them), commits it on `claude/wellness-<date>` with the report as the message, and pushes.
- **The local follow-up** files any pending tickets and puts their numbers in the row, opens the pull request, and merges it with `npm run can-merge -- <pr> --merge`. The description follows `.github/pull_request_template.md`, starting with a `**Tier:** tiny` line and a `**Builder:**` line, because `can-merge` refuses a PR without them; the report goes under its walkthrough. A row is a docs-only change, so the pull request skips the reviewer. Then it tells Jasper, check by check, what was found and which tickets were made, and asks him to type `/improve-codebase-architecture`.

## Runs

| Date | Ran in | Checked up to | Tickets | `npm test` | `npm run build` | Notes |
|---|---|---|---|---|---|---|
