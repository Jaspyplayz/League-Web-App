# 0012: A Claude-only workflow, with up to 4 builders and a Ready queue

Status: draft, waiting on Jasper's "In my words" (Linear JAS-27). It changes who reviews risky PRs and who builds, which 0008 to 0011 describe with Cursor, the Grok review or Cursor's cloud agents in them. Those records stay as they were written.

## Context

Until 2026-10-28, three tools worked on this repo. Claude Code on Opus 5.5 wrote features and fixes. The Cursor chat on Grok 4.7 reviewed risky PRs, made small edits, and updated `docs/STATUS.md` and leftover docs after each merge. A Cursor cloud agent on Grok or Composer could build a ticket that named it. Only two branches could be in progress at once.

That split cost Jasper time. Each risky PR needed him to open Cursor and paste in a review prompt, and the after-merge step meant another session per merge. The rules for three tools made `docs/workflow.md` 165 lines long, and every builder reads it. Jasper asked for more autonomy and parallelism, with everything on Claude, and the details were agreed in a planning session on 2026-10-28.

A cloud check the same day found that a Claude Code cloud session in the `League-Web-App` environment can install the app and pass lint, typecheck and the tests. Its GitHub proxy blocks GraphQL, so no `gh pr` or `gh issue` command works there yet, which includes `can-merge`, preview lookups, opening a PR and writing its Review section (JAS-26).

## Options considered

1. Keep Cursor for the second review only. This keeps a different model family on risky PRs, but Jasper still opens a second tool for every risky PR.
2. Drop the second look on risky PRs and rely on the reviewer agent. This is the cheapest, but a risky PR then gets one reviewer, from the same family that wrote it.
3. Replace the Grok review with a pstack `interrogate` panel: several models, run from Claude Code, each challenging the diff from its own angle. This keeps more than one model on risky PRs without a second tool.

## Decision

Option 3, along with these changes:
- **Cursor and Grok are gone.** `.cursor/` and `docs/STATUS.md` are deleted, and the after-merge step (status, leftover docs and the Dev Log entry) is dropped. Docs a PR leaves wrong get fixed in that PR. The code checks stay: `.cursor/settings.json` and `.cursor/rules/` are still on the risky list in `scripts/risky-paths.ts`, and `scripts/can-merge-gates.ts` still refuses a Builder line that names Cursor, Grok, Composer or a cloud agent. So a Cursor settings or rules file added later still goes to Jasper. Any other `.cursor/` file added later wasn't on the list before and still isn't.
- **Claude Code is the only builder**, in a local session or a cloud session.
- **The reviewer agent runs on Fable** (`model: fable` in `.claude/agents/reviewer.md`) instead of the builder's model, so the first review comes from a different model than the one that wrote the code.
- **Risky PRs get the reviewer agent plus an `interrogate` panel**. The panel records its own line in the Review section. It runs once per PR, on the same head commit as the reviewer's first review, on the first commit that passes the checks; after fixes only the reviewer agent re-checks, and a second panel runs only when Jasper asks (his words on 2026-10-29: "Once per PR"). If it can't run, the PR says "no interrogate panel yet".
- **Up to 4 branches in progress at once**, each touching different files. It was two.
- **A Ready status** in Linear (after Todo) holds tickets Jasper approved, which a builder may start without being asked. A later `/run-queue` skill will hand them to cloud sessions.
- **A startup hook** (`.claude/hooks/cloud-setup.mjs`) runs `npm ci` and `npx playwright install chromium` when a cloud session starts, is reopened or is forked, and nothing locally. It skips `npm ci` when `node_modules` already matches `package.json` and `package-lock.json`.
- **`docs/workflow.md` is under 80 lines.** The detail it dropped lives in the code and in `reviewer.md`, where agents already read it. The rules that only the builder follows, such as when to ask for a full review, stay in it.

The plan check and `/explain-back` stay as they were. Who merges stays too: Claude through `can-merge` for its tiny and normal PRs, Jasper for the rest.

## Consequences

Good:
- Jasper no longer opens Cursor for a review or after a merge.
- Four builders can work at once, and the Ready queue lets them start without waiting for him.
- Builders read a workflow under 80 lines instead of a 165-line one.
- The risky list and the builder guard still catch a Cursor settings or rules file, or a Cursor-built PR.

Bad:
- Every reviewer is now a Claude model or a model pstack picks, so the review loses Grok's view from another company's training.
- `interrogate` comes from pstack, which only Jasper's PC has. Until it's copied into `.claude/skills/` (the next ticket), a risky PR built in a cloud session needs a local session for the panel. Until JAS-26 a local session opens those PRs anyway, so the gap opens only once cloud sessions can open PRs themselves.
- Four branches at once means more merges of `main` into open branches, and a chance of two builders reaching for the same file. The open-PR check before editing is the only guard, and it's a habit, not a gate.
- `docs/STATUS.md` is gone, so "what's the status?" is answered by Linear and the merged PRs, not one page.
- The shorter `docs/workflow.md` drops the long explanations of the merge gates and re-review rules. Anyone who wants the why now reads 0008 to 0011 and the code. It also drops the old plan to count the reviewer's useful findings after 10 normal PRs.
- Until JAS-26, a cloud session can only push its branch. A local session opens the PR, runs the reviews and merges, so cloud builders save less of Jasper's time than they will later.
- The startup hook runs on every cloud session start, which adds the install time (about half a minute for `npm ci` on 2026-10-28, more with Chromium) before Claude's first reply. A reopened session on the same machine skips `npm ci`.

## In my words

_(Jasper writes this.)_
