<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Who writes this change

Claude Code on Opus 5.5 is the only builder, in a local session or a cloud session. One ticket has one builder: the one whose start comment on the Linear ticket came first. Up to 4 branches can be in progress at once, each touching different files. Claude Code merges its own pull requests, risky ones included, through `npm run can-merge -- <pr> --merge`, which the Agent merge workflow (`.github/workflows/agent-merge.yml`) runs from main once the PR says `**Ready to merge:** yes at <head sha>`. A risky one (risky tier, or a path on the panel list in `scripts/risky-paths.ts`) also needs an `Interrogate panel at <sha>: <n> to act on` line naming a commit in the PR that has its risky files. Jasper merges a PR that touches Jasper's list in `scripts/risky-paths.ts` (migrations, the schema they come from, and anything that defines or runs a check, apart from the smoke test's specs in `e2e/` and the verify and postmortem skills' Markdown), a one-way door, and every PR Claude Code didn't build. The full rule is [docs/workflow.md](docs/workflow.md#tickets-and-builders).

If another open pull request already edits a file, leave that file alone.

## Cloud sessions

A Claude Code cloud session starts from a pushed branch, usually `origin/main`, on Node 22. Its startup hooks run `npm ci` and `npx playwright install chromium`, and download Matt Pocock's skills. Those skills can appear only after your first tool call, and a line from that hook in your context says if they failed ([details](docs/workflow.md#matt-pococks-skills)). How the rules below were found out is in [docs/workflow.md](docs/workflow.md#tickets-and-builders).

- **GitHub goes over REST.** GraphQL is blocked there, so `gh pr`, `gh issue` and skills that call them, such as `fix-ci`, need a local session. `gh api` does the same jobs: `-X POST repos/Jaspyplayz/League-Web-App/pulls` opens a pull request, `-X POST .../issues/<n>/comments` comments on it, and `-X PATCH .../pulls/<n> -F body=@<file>` edits its description.
- **Prove it there.** `npm run can-merge -- <pr>`, `npm run shot -- --pr` and the `reviewer` agent all work in a cloud session, so try each acceptance criterion, screenshot and review there before leaving it to a local session. `npm run test:e2e` runs against the Vercel preview, not on that machine.
- **Merging.** The cloud's permission check refuses `can-merge --merge`. Set `**Ready to merge:** yes at <head sha>` as your last step, and the Agent merge workflow merges the pull request from main once every gate passes (docs/workflow.md step 11).
- **Before pushing,** run `npm run lint`, `npm run typecheck`, `npm test` and `npm run build`.
- **Do not run** `npm run db:migrate`. Secrets come from the cloud environment, never from a file in the repo.

## Code Review Rules

When you review a pull request, read CLAUDE.md first for the project rules,
use the checklist in .claude/agents/reviewer.md, and report findings
without editing files. Review is a second look, not a second builder:
do not start a parallel implementation of the same issue.
Only the reviewer agent starts its report with `Reviewer agent at <sha>:`.
Any other review, such as the `interrogate` panel on a risky pull request,
starts with its own name instead, like `Interrogate panel at <sha>:`, and never
writes `Reviewer agent at`. GitHub's `reviewer` check counts a line that
starts with `Reviewer agent at <sha>:` as the reviewer's verdict, after a
blank line, the heading or another verdict, and fails the PR on any other line
naming a commit that way, so quote another review without its `at <sha>:`
(decision record 0019).
