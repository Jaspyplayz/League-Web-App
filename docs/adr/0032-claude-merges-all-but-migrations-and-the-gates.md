# 0032: Claude merges everything it builds after the panel, except migrations and the merge gates

Status: draft until Jasper merges JAS-191's PR, which he merges by hand, since it changes `scripts/risky-paths.ts` and `.github/workflows/agent-merge.yml`. It shrinks [0025](0025-risky-prs-merge-after-the-panel.md)'s `JASPERS_PATHS` and removes [0028](0028-the-verify-and-postmortem-skills-merge-after-the-panel.md)'s `PANEL_SKILLS`; both records get an "Amended by" note on their Status lines and otherwise stay as they were written.

## Context

[0025](0025-risky-prs-merge-after-the-panel.md) kept three kinds of PR Jasper's: anything that defines or runs a check, migrations, and one-way doors. [0028](0028-the-verify-and-postmortem-skills-merge-after-the-panel.md) then let the verify and postmortem skills' Markdown go. Even so, 22 of Claude's 60 merged PRs from 227 to 290 touched Jasper's list, and every ticket that needed one of those files waited behind them.

On 2026-11-02 Jasper said "let everything be able to merge because I don't even verify it the other way, so what's the point?" A merge nobody checks protects nothing, so the wait goes. He kept one group: the gates' own code ("the gates own 'you can't change'"), so an agent can't loosen a gate and merge that. Migrations stay his because of what merging does, not because of checking: only he runs `npm run db:migrate`, and code merged before its migration breaks the live site's reads.

## Options considered

- **Keep the lists as they were.** About a third of Claude's PRs keep waiting for a click that checks nothing.
- **Empty Jasper's list.** An agent could then loosen `can-merge` and merge that, and a migration could merge before anyone runs it.
- **Keep migrations and the merge gates (chosen).**

## Decision

`JASPERS_PATHS` in `scripts/risky-paths.ts` holds only:

- **Migrations:** `drizzle/`, `drizzle.config.ts` and `src/db/schema.ts`.
- **The merge gates:** `scripts/can-merge*` (the gates, the Action's script, the REST reader, the reviewer check, their tests, fixtures and tsconfig), `scripts/risky-paths*` (these lists and their tests), the Agent merge workflows, the reviewer workflow, `.claude/agent-merge.json` (the switch), and `.claude/settings*`. The two workflow patterns have no extension, because GitHub runs `.yaml` files too, so an `agent-merge.yaml` or `reviewer.yaml` is his as well. A builder can still propose a change to any of these, and Jasper merges it.

`.claude/settings*` wasn't on the ticket's list. Its deny rules stop a session merging with `gh pr merge` or the REST merge request, and stop it editing the switch, so they're what keeps every merge going through `can-merge`. On the panel list, a PR could drop them, and the next local session could merge a migration or a gate change with Jasper's `gh` login. The reviewer agent caught this on the PR's first commit. A test in `scripts/risky-paths.test.ts` checks that the rules are there and that their file is Jasper's.

Everything else that was on his list moves to `PANEL_PATHS`: the rest of `.github/` (CI, the smoke test, dependency review, Dependabot's settings, the PR and issue templates), the rest of `.claude/` (hooks, agents including the reviewer, skills, rules, and any new folder), the Cursor paths, the lint, TypeScript, Next.js, Vitest and Playwright configs, `vercel.json`, the two look checks, the three files that send or guard the preview's bypass secret, `package.json`, `package-lock.json`, `.npmrc`, `.nvmrc`, `.mcp.json`, the ticket queue's scripts, and a `.claude/` or `.cursor/` folder below the root. Each needs the interrogate panel and the reviewer, and `can-merge` merges it once both clear the head commit.

Three of those files can change what the Agent merge job runs with its token, though `scripts/can-merge*` doesn't change. The panel found each one, and each was shown on a copy of this repo on 2026-11-02:

- An `.npmrc` with `node-options=--require ./x.cjs` loads that file into every `npx` the job runs.
- A `postinstall` script in `package.json` runs during `npm ci`.
- A `paths` entry in `tsconfig.json` makes `tsx` load a file a PR adds in place of `zod`, which every gate imports.

So `agent-merge.yml` deletes `.npmrc`, installs with `npm ci --ignore-scripts`, and sets `TSX_TSCONFIG_PATH` to `scripts/can-merge.tsconfig.json`, which has no `paths` and is on Jasper's list. The variable reaches the `npx tsx scripts/can-merge.ts` that the Action's script starts. With these, the hostile `.npmrc`, script and `tsconfig.json` each did nothing, and `can-merge` still ran.

Two more checks in `scripts/risky-paths.test.ts`, which is Jasper's file and runs in CI at every PR's head:

- **Every workflow off Jasper's list sets its token's permissions and asks for no write access.** GitHub counts a check named `check` or `reviewer` from any workflow, so one Claude merges with a write token could merge PRs past `can-merge`. A workflow that needs write access has to change this test.
- **Every file the gates import is on Jasper's list**, following their relative imports, so a helper split out under another name can't fall off both lists.

`PANEL_SKILLS` and its checks go. All of `.claude/skills/` is on the panel list now, so the carve-out has nothing left to carve out of. Its checks (each listed skill's files are plain files, and each `SKILL.md` has only a name and a description) kept four skills from granting tools, adding hooks or running commands while every other skill was Jasper's. `.claude/hooks/`, which can run commands directly, now merges after the panel too, so those checks would guard nothing the panel list doesn't already open.

A nested `eslint.config.{js,mjs,cjs,ts,mts,cts}` becomes a panel path, wherever it is. ESLint 10 reads the config nearest each file, so a one-line `export default []` in `src/lib/x/eslint.config.mjs` turns lint off for that folder: on 2026-11-02 a file with a lint error passed with exit code 0 once one was added next to it. Until now the path was on neither list, so a tiny PR could add one with no reviewer. A codebase audit that day found it.

These stay as they were: the "Built by Claude Code" gate, so Dependabot's PRs, a fork's, a bot's and any branch not starting `claude/` still wait for Jasper (the repo is public, and merged code goes live with production secrets); the "Two-way door" gate; the switch; and Jasper's weekly read of Claude's merged PRs.

## Consequences

Good:

- Re-run over Claude's 60 merged PRs from 227 to 290, 15 touch Jasper's list instead of 22. Eight of the 15 changed the gates or their tests (240, 241, 242, 243, 250, 251, 275, 276).
- A PR that changes a check, a hook, a skill or a dependency merges once its panel and reviewer clear it, without waiting for Jasper.
- A nested `eslint.config` needs the panel and the reviewer.
- The Agent merge job no longer runs an `.npmrc`, an install script or a `tsconfig.json` that anyone could merge.

Bad:

- **An agent can loosen a check and merge that.** CI, lint rules, the test configs, the commit hook, the look tests, the reviewer agent's instructions and the skills it loads can all be weakened by a PR Claude merges, with only the panel and the reviewer reading it. What the gates read can change: `can-merge` needs `check` to pass, and a PR can change what `check` runs, including whether it runs the two tests above. Jasper accepted this, since his click wasn't checking either.
- **The reviewer clears changes to itself.** A PR that edits `.claude/agents/reviewer.md`, or a skill it loads, is reviewed by the agent as it was before the edit, and the next PR by the edited one.
- **The dependencies still decide what the Agent merge job runs.** `tsx` and `zod` come from main's `package-lock.json`, which Claude can merge, and they run with the token. A lockfile that points one at another tarball shows in the diff, and only the panel and the reviewer read it. A manifest and lockfile of the gates' own, under `scripts/can-merge*`, would close this; this record doesn't make that choice.
- **Jasper's own computer runs files Claude can merge.** The hooks `.claude/settings.json` names (`pstack-context.mjs` at every session start, and the commit hook) and `package.json`'s scripts, `npm run db:migrate` included, run there with his `gh` login and `.env.local`. A scheduled task pulls main every 30 minutes, so a merged change reaches his next session.
- **Other jobs that run the repo's code with a secret** read `package.json`, `.npmrc` and `tsconfig.json` from main the way Agent merge did before this record. The reviewer check runs the PR's own copy until the open reviewer-check PR moves it to main's; the run-queue workflow in another open PR holds Linear and task tokens. Each needs the same three steps.
- **A workflow can still merge past `can-merge`** if a PR also stops CI running the permissions test, or if a workflow added to a branch runs on its own PR before it merges ([0024](0024-a-github-action-runs-can-merge.md)). GitHub's required `check` and `reviewer` checks can come from any workflow, so the ruleset only really pins Vercel's.
- **A tiny PR can still switch lint off for one file** with an `/* eslint-disable */` line, with no reviewer, as it can skip a short test. Both are on a Backlog ticket about what a tiny PR can change unreviewed.
- More PRs now rest on the panel line and the reviewer's verdict, which are text the builder writes ([0025](0025-risky-prs-merge-after-the-panel.md)'s consequence).
- `docs/agent-mistakes.md` still says Jasper's list holds "anything that defines a check", and names the `SKILL.md` test this removes; this PR's postmortem entry waits on it too. An open PR changes that file, so both wait for that PR. The entry in `docs/agent-mistakes/opened-gate-dropped-its-guard.md` that put `src/app/themes.test.ts` on Jasper's list is undone on purpose, and says so.

## Open questions

1. Seven of the 15 PRs that would still wait for Jasper were features that also edited `scripts/risky-paths.ts` to list a new or renamed risky file (227, 231, 248, 255, 263, 265, 274). Under this record each such path goes on the panel list, which is still in his file. Should `PANEL_PATHS` move to a file of its own, off his list? Removing a path from it would then need only the panel and the reviewer, though `scripts/risky-paths.test.ts` would still fail if a route, server action or database client dropped off both lists.
2. Should merging use a credential no other workflow can reach, such as a GitHub App whose checks the ruleset requires by app? That would close the workflow route above for good, but it changes GitHub settings, which only Jasper can do.
