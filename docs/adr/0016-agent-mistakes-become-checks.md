# 0016: Agent mistakes become checks without Jasper asking

Status: accepted (Linear JAS-61, built in JAS-62 to JAS-66). It also ends "In my words": Jasper decided on 2026-10-29 that decision records no longer have that part, so 0005 to 0015, which say they're waiting on it, count as accepted and stay as written.

## Context

Jasper's rule is that a mistake caught twice becomes a check (a lint rule, test, hook or CI step), not another line of instructions. Until now that only happened when Jasper noticed a mistake and asked for a postmortem. The `postmortem` skill lived in `~/.claude/skills/` on his PC, so cloud sessions couldn't run it, and nothing told a builder when to. PR 210 (JAS-59) was the first postmortem, logged as one row of a table in `docs/agent-mistakes.md`.

Lessons also landed in Claude's memory notes, which only Jasper's PC loads. Claude Code's docs say auto memory files "are not shared across machines or cloud environments", and the same project already had two memory folders whose copies had drifted (5 of 15 notes differed).

Jasper's other project, petri, runs a fuller version: its `postmortem` skill is in the repo, its description lists the events that should start it, and a CI workflow runs one after an automatic revert. Its log has 32 entries in one file, and at least 8 of them still say "none yet" or "none reached yet" for the fix.

The design came from a grilling interview with Jasper on 2026-10-29 (18 questions, all accepted).

## Options considered

1. **Where the log lives.**
   - One table in `docs/agent-mistakes.md`: every postmortem appends a row at the same place, so up to 4 builders working at once conflict there, and nothing checks the columns.
   - Linear tickets, one per mistake class with repeats as comments: easy to search, but Linear's tools sometimes fail in cloud sessions (`docs/wellness.md` plans for that), and the template uses GitHub issues.
   - One file per mistake class in `docs/agent-mistakes/`: two PRs conflict only when they log the same class, every session can read it, and a test can check its shape.
2. **Who starts a postmortem.**
   - Jasper, by asking: today's gap.
   - A hook on failed commands: it can't tell an agent's mistake from a flaky test or an outage.
   - The builder that hit the mistake, prompted by the skill's description (the trigger events) and a step in `docs/workflow.md`, with the wellness check as a backstop.
3. **Which skill does what.** pstack's `correct` sweeps a repo for mistake classes and fixes each at the highest level; `reflect` turns a session's lessons into skill edits; Matt Pocock's `retro` suggests changes to the agent's environment after a session. All three run only when asked, `retro` only from its slash command, and `reflect` edits pinned pstack skills.
4. **Evals.** Petri adds an eval case with each postmortem: a replay of the original task that a second model scores against a rubric. It's the only way to test a lesson no check can catch, but Turnpoint has no eval runner, each run costs API money, and scores vary between runs.
5. **Memory.** Keep lessons in memory notes, or move every repo lesson into the repo and keep memory for facts about Jasper and live status. Matt Pocock calls memories secondary sources that drift and need pruning.

## Decision

- **Log:** one file per mistake class in `docs/agent-mistakes/`, each occurrence a dated entry with What happened, Evidence, Root cause, Rung and Fix. `docs/agent-mistakes.md` stays at its path as the index: the fix ladder, the entry format, the class table, and each rule next to what enforces it (`correct`'s rule table). `scripts/agent-mistakes.test.ts` fails on an entry in another shape, a rung that isn't on the ladder, or a class table row that doesn't match its file.
- **Words:** Agent mistake, Mistake class, Repeat, Postmortem and Rung are defined under Workflow in `GLOSSARY.md`. "Mistake" alone is a play's grade there.
- **What counts:** a reviewer blocker, a failed `can-merge` gate or CI check the agent caused, Jasper correcting an agent, or a find in his weekly read of merged PRs. Every one is logged; the fix is built on a repeat, or sooner when it's small and obvious.
- **Who:** the builder, in the same session, through the repo's own `postmortem` skill (JAS-63) and a step before Shipping. The entry goes in the PR where the mistake happened; the fix does too when it's small and doesn't raise the tier, otherwise it becomes a `Postmortem:` ticket.
- **Reviews:** each reviewer blocker says whether a check could have caught it (JAS-64); judgement-call lessons go in the reviewer's checklist, where Matt Pocock's `retro` puts coding standards.
- **Backstop:** the wellness check gets a fifth check that reads the log for repeats at a weak rung, rules nothing enforces, and blockers with no entry (JAS-65).
- **Skills:** `postmortem` handles one mistake, using `correct`'s ladder; `correct` is the sweep; `retro` and `reflect` stay with Jasper.
- **Memory:** a one-time sweep moves each repo lesson out of Claude's memory notes into the repo, checks it's covered, and deletes the note (JAS-66).
- **No evals yet.**
- **Template:** after Turnpoint has run it (project-template#24).

## Consequences

- The log has a shape a test enforces, so the wellness check and `correct` can count repeats and rungs instead of reading free text.
- Two PRs that add new classes at the same time both add a row to the index's class table, so they can still conflict there. The conflict is one line, and the test catches a row that's wrong after it's resolved.
- The index keeps PR 210's path, so its links and the comment in `scripts/can-merge-gates.test.ts` stay right without touching a file on the risky list.
- A builder has to recognise its own mistake. Nothing forces that; the wellness check finds the ones it missed, two weeks later at most.
- Lessons only a model can judge, such as "reproduce before you fix", have no automatic proof until evals exist. They sit at the "rule file or skill" rung.
- Memory gets smaller, and cloud sessions see every lesson the local ones do.
