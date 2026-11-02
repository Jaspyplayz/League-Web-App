# 0027: Claude Code may move a written-up ticket to Ready

Status: accepted. It changes [0012](0012-claude-only-workflow.md)'s "A Ready status in Linear holds tickets Jasper approved"; that record stays as it was written.

## Context

Ready means a builder may take a ticket without being asked. Until now only Jasper moved tickets there, which made him the one step between a written-up ticket and a builder. `/run-queue` (JAS-29, [0026](0026-a-script-picks-tickets-and-an-action-starts-builders.md)) starts builders from Ready, so that step would hold the queue up.

On 2026-11-01 he said: "I gave permission for you to change stuff to ready." Later that day he widened it: "You should make it so you can change it for the backlog, and I give you permission. But we need to add it to our project."

## Options considered

- **Jasper stays the only one who moves tickets.** He sees every ticket before it's built, but the queue waits on him.
- **Claude Code moves any ticket.** Nothing waits, but a fix nobody asked for could get built and merged without him seeing it.
- **Claude Code moves a written-up ticket, with exceptions.** The queue keeps moving on work someone asked for, and he keeps the tickets agents raise on their own.

## Decision

Claude Code may move a Backlog or Todo ticket to Ready once it has the Feature or fix sections, a Priority and a `Touches:` line. It says why on the ticket and tells Jasper which one it moved.

Only Jasper moves `Postmortem:` and `Wellness:` tickets, because they're fixes he hasn't asked for, and tickets assigned to him, because those need him to do the work. A `to-spec` parent ticket and a `wayfinder` ticket never move to Ready, because no PR builds them. The `approved` label stays his.

## Consequences

- A ticket can now go from Backlog to merged without Jasper reading it first. He can move a ticket back, and his weekly read of merged PRs is the check afterwards.
- The `Touches:` line has an agreed meaning, the files the work changes, which `/run-queue` can read to tell which tickets can run at once.
- Nothing enforces these rules yet. They're instructions to agents, until JAS-143's picking script can check them.
