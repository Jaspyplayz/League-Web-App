# 0032: Claude merges everything it builds after the panel, except migrations and the merge gates

Status: draft until Jasper merges JAS-191's PR, which he merges by hand, since it changes `scripts/risky-paths.ts`. It shrinks [0025](0025-risky-prs-merge-after-the-panel.md)'s `JASPERS_PATHS` and removes [0028](0028-the-verify-and-postmortem-skills-merge-after-the-panel.md)'s `PANEL_SKILLS`; both records stay as they were written.

## Context

[0025](0025-risky-prs-merge-after-the-panel.md) kept three kinds of PR Jasper's: anything that defines or runs a check, migrations, and one-way doors. [0028](0028-the-verify-and-postmortem-skills-merge-after-the-panel.md) then let the verify and postmortem skills' Markdown go. Even so, 22 of Claude's 60 merged PRs from 227 to 290 touched Jasper's list, and every ticket that needed one of those files waited behind them.

On 2026-11-02 Jasper said "let everything be able to merge because I don't even verify it the other way, so what's the point?" A merge nobody checks protects nothing, so the wait goes. He kept one group: the gates' own code ("the gates own 'you can't change'"), so an agent can't loosen a gate and merge that. Migrations stay his because of what merging does, not because of checking: only he runs `npm run db:migrate`, and code merged before its migration breaks the live site's reads.

## Options considered

- **Keep the lists as they were.** About a third of Claude's PRs keep waiting for a click that checks nothing.
- **Empty Jasper's list.** An agent could then loosen `can-merge` and merge that, and a migration could merge before anyone runs it.
- **Keep migrations and the gates' own code (chosen).**

## Decision

`JASPERS_PATHS` in `scripts/risky-paths.ts` holds only:

- **Migrations:** `drizzle/`, `drizzle.config.ts` and `src/db/schema.ts`.
- **The merge gates' own code:** `scripts/can-merge*` (the gates, the Action's script, the REST reader, the reviewer check, their tests and fixtures), `scripts/risky-paths*` (these lists and their tests), the Agent merge workflows, the reviewer workflow, and `.claude/agent-merge.json`, the switch. The two workflow patterns have no extension, because GitHub runs `.yaml` files too, so an `agent-merge.yaml` or `reviewer.yaml` is his as well. A builder can still propose a change to any of these, and Jasper merges it.

Everything else that was on his list moves to `PANEL_PATHS`: the rest of `.github/` (CI, the smoke test, dependency review, Dependabot's settings, the PR and issue templates), the rest of `.claude/` (settings, hooks, agents including the reviewer, skills, rules, and any new folder), the Cursor paths, the lint, TypeScript, Next.js, Vitest and Playwright configs, `vercel.json`, the two look checks, the three files that send or guard the preview's bypass secret, `package.json`, `package-lock.json`, `.npmrc`, `.nvmrc`, `.mcp.json`, the ticket queue's scripts, and a `.claude/` or `.cursor/` folder below the root. Each needs the interrogate panel and the reviewer, and `can-merge` merges it once both clear the head commit.

`PANEL_SKILLS` and its checks go. All of `.claude/skills/` is on the panel list now, so the carve-out has nothing left to carve out of. Its checks (each listed skill's files are plain files, and each `SKILL.md` has only a name and a description) kept four skills from granting tools, adding hooks or running commands while every other skill was Jasper's. `.claude/settings.json` and `.claude/hooks/`, which can do all of that directly, now merge after the panel too, so those checks would guard nothing the panel list doesn't already open.

A nested `eslint.config` becomes a panel path, wherever it is. ESLint 10 reads the config nearest each file, so a one-line `export default []` in `src/lib/x/eslint.config.mjs` turns lint off for that folder: on 2026-11-02 a file with a lint error passed with exit code 0 once one was added next to it. Until now the path was on neither list, so a tiny PR could add one with no reviewer. A codebase audit that day found it.

These stay as they were: the "Built by Claude Code" gate, so Dependabot's PRs, a fork's, a bot's and any branch not starting `claude/` still wait for Jasper (the repo is public, and merged code goes live with production secrets); the "Two-way door" gate; the switch; and Jasper's weekly read of Claude's merged PRs.

## Consequences

Good:

- Re-run over Claude's 60 merged PRs from 227 to 290, 15 touch Jasper's list instead of 22. Eight of the 15 changed the gates or their tests (240, 241, 242, 243, 250, 251, 275, 276).
- A PR that changes a check, a hook, a skill or a dependency merges once its panel and reviewer clear it, without waiting for Jasper.
- A nested `eslint.config` needs the panel and the reviewer.

Bad:

- **An agent can loosen a check and merge that.** CI, lint rules, the test configs, the commit hook, the look tests, the reviewer agent's instructions and the skills it loads can all be weakened by a PR Claude merges, with only the panel and the reviewer reading it. The gates' code can't change without Jasper, but what they read can: `can-merge` needs `check` to pass, and a PR can change what `check` runs. Jasper accepted this, since his click wasn't checking either.
- **The reviewer clears changes to itself.** A PR that edits `.claude/agents/reviewer.md`, or a skill it loads, is reviewed by the agent as it was before the edit, and the next PR by the edited one.
- **`package.json` and `package-lock.json` decide what the Agent merge workflow runs.** It runs `npm ci` from main before `can-merge` gets a token that can merge, so a merged install script, or a changed dependency such as `tsx`, can change what that job does without touching `scripts/can-merge*`. The panel and the reviewer read the diff. Installing with `npm ci --ignore-scripts` in `agent-merge.yml` would close the install-script route; this record doesn't make that choice.
- **A workflow outside the gates' files can be given write access** and merge PRs without `can-merge`. That was already true of a workflow a branch adds, which runs on its own PR before it merges ([0024](0024-a-github-action-runs-can-merge.md)); now one can also reach main without Jasper. GitHub's branch protection (`check`, `Vercel` and `reviewer` must pass) still applies to every merge.
- More PRs now rest on the panel line and the reviewer's verdict, which are text the builder writes ([0025](0025-risky-prs-merge-after-the-panel.md)'s consequence).
- `docs/agent-mistakes.md` still says Jasper's list holds "anything that defines a check", and names the `SKILL.md` test this removes. An open PR changes that file, so it's corrected after that PR merges. Older records and `docs/agent-mistakes/` entries stay as written.

## Open questions

1. Seven of the 15 PRs that would still wait for Jasper were features that also edited `scripts/risky-paths.ts` to list a new or renamed risky file (227, 231, 248, 255, 263, 265, 274). Under this record each such path goes on the panel list, which is still in his file. Should `PANEL_PATHS` move to a file of its own, off his list? Removing a path from it would then need only the panel and the reviewer, though `scripts/risky-paths.test.ts` would still fail if a route, server action or database client dropped off both lists.
