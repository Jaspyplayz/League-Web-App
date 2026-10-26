# 0009: can-merge covers database code outside src/db/, and tiny PRs that change code get the reviewer

Status: draft, waiting on Jasper's "In my words" (Linear JAS-12). Amends [0008](0008-agents-merge-two-way-doors.md).

## Context

The reviewer agent reviewed #170, the PR behind 0008, after it merged. Its verdict at 1799eba was one blocker. The risky list in `scripts/risky-paths.ts` protected `src/db/`, but the stores in `src/lib/` also write and delete rows: `match-note-store.ts` deletes a user's notes. A PR labelled tiny that changed a store passed every gate with no review, so 0008's promise that database code stays Jasper's to merge was untrue.

The review found two more gaps. A PR's own tier line switched the reviewer off, whatever files the PR changed. The checkbox gate missed boxes in numbered and `+` lists, so an unticked criterion could pass.

## Options considered

1. Widen the risky list and keep trusting the tier line. A tiny PR labelled by mistake still skips all review.
2. Widen the risky list, and let a tiny PR skip the reviewer only when every file it changes is a doc (`docs/` or a `.md` file).
3. Make every PR that changes code normal. Each one would need a ticket and acceptance criteria, which is more than a one-line copy fix needs.

## Decision

Option 2:
- The risky list also covers `src/lib/*-store.ts`, `src/lib/my-player.ts`, `scripts/remap-puuids`, `scripts/collect-benchmarks`, `src/lib/mcp/`, `.claude/skills/` and `.claude/rules/`.
- A tiny PR skips the reviewer only when it changes nothing but docs. A tiny PR that changes code needs the reviewer's "no blockers" line at its head commit.
- Any box that isn't `[x]`, in any list GitHub renders, counts as unticked.
- `can-merge` checks only that each criterion is ticked. The reviewer checks that each one has a screenshot or a test name, because a code check of free text would refuse good evidence or accept bad.

## Consequences

Good:
- Database code, the MCP server's cap on Riot calls, and the reviewer's own instructions are Jasper's to merge again, whatever the tier says.
- Claude Code merges no change to code without a second look.

Bad:
- A tiny copy fix in a component waits for one reviewer run before it merges.
- The risky list is still a list. A new folder that writes rows can merge until someone adds it. `.claude/rules/database.md` names the same database paths, so the two lists can drift apart.
- A tier line that says "risky" anywhere, such as "nothing on the risky list", is refused as naming two tiers. That is safe, but the builder has to keep tier words out of the reason.

## In my words

_(Jasper writes this.)_
