<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Who writes this change

One branch has one builder, named on the issue. Claude Code on Opus 5.5 writes this app's features and fixes. The Cursor chat, on Grok 4.7, does a small edit while Jasper is at the machine, reviews a risky pull request without editing it, and updates status and leftover docs after that pull request merges. A cloud agent is the builder only when the issue says so. Claude Code merges only its own tiny and normal pull requests, through `npm run can-merge -- <pr> --merge`, and Jasper merges every other one. The full rule is [docs/workflow.md](docs/workflow.md#which-tool-writes-the-code).

If another open pull request already edits a file, leave that file alone.

## Cursor Cloud specific instructions

A cloud agent on this repo uses Grok or Composer, branches from `origin/main`, and opens a draft pull request. It does not merge, and it does not write "My read".

Node 22. The environment build runs `npm ci`. Before pushing, run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`. `npm run test:e2e` runs against the Vercel preview, not in this machine. Do not run `npm run db:migrate`. Secrets come from the cloud environment, never from a file in the repo.

## Code Review Rules

When you review a pull request, read CLAUDE.md first for the project rules,
use the checklist in .claude/agents/reviewer.md, and report findings
without editing files. Review is a second look, not a second builder:
do not start a parallel implementation of the same issue.
Start your report with `Second review (<your model>) at <sha>:`, never
`Reviewer agent at`, because GitHub's `reviewer` check counts only the
reviewer agent's lines.
