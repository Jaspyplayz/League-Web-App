# 0009: can-merge covers database code outside src/db/, and tiny PRs that change code get the reviewer

Status: draft, waiting on Jasper's "In my words" (Linear JAS-12). Amends [0008](0008-agents-merge-two-way-doors.md).

## Context

The reviewer agent reviewed #170, the PR behind 0008, after it merged. Its verdict at 1799eba was one blocker. The risky list in `scripts/risky-paths.ts` protected `src/db/`, but the stores in `src/lib/` also write and delete rows: `match-note-store.ts` deletes a user's notes. A PR labelled tiny that changed a store passed every gate with no review, so 0008's promise that database code stays Jasper's to merge was untrue.

The review found two more gaps. A PR's own tier line switched the reviewer off, whatever files the PR changed. The checkbox gate missed boxes in numbered and `+` lists, so an unticked criterion could pass.

The review of the fix (#178) found that the tiny rule still let a PR change `CLAUDE.md`, `AGENTS.md` or `docs/workflow.md` with no review. Agents follow those files as rules. It also found three server actions off the list. Anyone can call a server action, and two of them spend Riot calls. A second review found the same gap for `CLAUDE.local.md` and for rule files under other names, so the rule now names what counts as a doc instead of what doesn't. A third found the same for code files in `docs/`, which `npm test` runs. A fourth found it for a `.claude/` folder inside `docs/`, and for a path spelled with other capitals, which Windows writes over the real file.

## Options considered

1. Widen the risky list and keep trusting the tier line. A tiny PR labelled by mistake still skips all review.
2. Widen the risky list, and let a tiny PR skip the reviewer only when every file it changes is a doc. The files agents follow as rules aren't docs.
3. Make every PR that changes code normal. Each one would need a ticket and acceptance criteria, which is more than a one-line copy fix needs.
4. Option 2, with `CLAUDE.md`, `AGENTS.md` and `docs/workflow.md` on the risky list too. `CLAUDE.md` changed in 24 of the last 60 commits on main (17 to 25 October 2026), so about 2 in 5 PRs would be Jasper's to merge.

## Decision

Option 2:
- The risky list also covers `src/lib/*-store.ts`, `src/lib/my-player.ts`, `scripts/remap-puuids`, `scripts/collect-benchmarks`, `scripts/check-score`, `src/lib/mcp/`, the three server actions, `.claude/skills/` and `.claude/rules/`, and any `.claude/` or `.cursor/` folder below the root. A path matches in any case, because Windows ignores case.
- A test in `scripts/risky-paths.test.ts` fails when a route, a server action, or a file that imports the Postgres client, Drizzle or `src/db/` by any path is off the list. It allows only imports of modules in `src/db/` that never touch the database, such as `freshness.ts`. A store under a new name can't merge as normal code.
- A tiny PR skips the reviewer only when it changes nothing but docs. Docs here means the `.md` files and images in `docs/` and the root `README.md` and `ARCHITECTURE.md`. `docs/workflow.md`, any `CLAUDE` or `AGENTS` file, and anything in a dot folder aren't docs in any case, because agents follow them as rules. A tiny PR that changes anything else, such as `CLAUDE.local.md` or a fixtures README, needs the reviewer's "no blockers" line at its head commit.
- Any box that isn't `[x]`, in any list GitHub renders, nested or quoted, counts as unticked. A `## ` line inside a code block doesn't end the section.
- `can-merge` checks only that each criterion is ticked. The reviewer checks that each one has a screenshot or a test name, because a code check of free text would refuse good evidence or accept bad. `.claude/agents/reviewer.md` asks it to.

## Consequences

Good:
- Database code, server actions, the MCP server's cap on Riot calls, and the reviewer's agent file, skills and rules are Jasper's to merge again, whatever the tier says.
- Claude Code merges no change without a second look, unless it touches only the `.md` files and images in `docs/`, `README.md` or `ARCHITECTURE.md`.

Bad:
- A tiny copy fix in a component waits for one reviewer run before it merges.
- An agent can still change `CLAUDE.md`, `AGENTS.md` or `docs/workflow.md` with only the reviewer's look, not Jasper's.
- The risky list is still a list. The test catches server actions and database imports, not every kind of risk. Caps on Riot calls inside pages, such as the log page's `TIMELINES_PER_VIEW`, stay off it, and the rate limiter in `src/lib/riot/` still bounds the total. `.claude/rules/database.md` names the same database paths, so the two lists can drift apart.
- `can-merge` reads the PR body line by line, not as GitHub renders it. A box inside an HTML comment or a four-backtick code block can still be misread, so the reviewer's check of each criterion still matters.
- A tier line that says "risky" anywhere, such as "nothing on the risky list", is refused as naming two tiers. That is safe, but the builder has to keep tier words out of the reason.

## In my words

_(Jasper writes this.)_
