<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Who writes this change

Claude Code on Opus 5.5 is the only builder, in a local session or a cloud session. One ticket has one builder: the one whose start comment on the Linear ticket came first. Up to 4 branches can be in progress at once, each touching different files. Claude Code merges only its own tiny and normal pull requests, through `npm run can-merge -- <pr> --merge`, which the Agent merge workflow (`.github/workflows/agent-merge.yml`) runs from main each time a check finishes, and Jasper merges every other one. The full rule is [docs/workflow.md](docs/workflow.md#tickets-and-builders).

If another open pull request already edits a file, leave that file alone.

## Cloud sessions

A Claude Code cloud session starts from a pushed branch, usually `origin/main`, and its startup hook (`.claude/hooks/cloud-setup.mjs`) runs `npm ci` and `npx playwright install chromium`. Another (`.claude/hooks/pocock-skills.mjs`) downloads Matt Pocock's skills into `~/.claude/skills/`, outside the repo; on a fresh machine they should appear after your first tool call (seen on Jasper's PC, not yet in the cloud), and the hook's line in your context says if they failed. GitHub's GraphQL API is blocked there, so no `gh pr` or `gh issue` command works. `npm run can-merge` and `npm run shot -- --pr` use GitHub's REST API instead, so that block doesn't stop them (JAS-26). Opening a pull request and commenting on it work over REST too (`gh api -X POST repos/Jaspyplayz/League-Web-App/pulls`, and `.../issues/<n>/comments`): a cloud session opened, waited on and merged PR 204 that way. A cloud session doesn't run `can-merge --merge` itself, since the cloud's permission check refuses it (PR 234): once every gate passes, the Agent merge workflow merges the pull request from main (JAS-121). Editing a description works over REST too (`gh api -X PATCH .../pulls/<n> -F body=@<file>`), the `reviewer` agent runs in a cloud session, and `npm run shot -- --pr` gets past a preview's Vercel login with the environment's bypass secret: PR 234 did all three. So try each acceptance criterion, screenshot and review there before leaving it to a local session. Skills that call `gh pr`, such as `fix-ci`, don't work there. Node 22. Before pushing, run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`. `npm run test:e2e` runs against the Vercel preview, not in this machine. Do not run `npm run db:migrate`. Secrets come from the cloud environment, never from a file in the repo.

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
