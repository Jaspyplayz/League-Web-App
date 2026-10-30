---
name: postmortem
description: Log an agent mistake in docs/agent-mistakes/ and pick its fix from the fix ladder. Start it yourself, in the session that catches it, as soon as one is caught - a reviewer blocker you can't reject, a failed can-merge gate or CI check your change caused (not a flaky test or an outage), Jasper correcting a mistake, or a find in Jasper's weekly read of merged PRs - or when someone says "postmortem this".
---

# Postmortem

Every agent mistake should make the next one less likely. A mistake that's only logged repeats; one that becomes a check can't. So log every one, and build the fix on a repeat, or sooner when it's cheap. The words (agent mistake, mistake class, repeat, rung) are defined under Workflow in `GLOSSARY.md`, and why it works this way is in `docs/adr/0016-agent-mistakes-become-checks.md`.

## What counts

- A blocker from the reviewer agent that you fix rather than reject with evidence.
- A failed `npm run can-merge` gate or CI check that your change caused. A flaky test, a GitHub or Vercel outage, an expired Riot key, a gate still waiting on a running check, or a switch Jasper turned off isn't one.
- Jasper correcting a mistake. A changed requirement isn't one.
- A find in Jasper's weekly read of the PRs Claude merged.

Run it in the session that catches the mistake, as soon as it's caught. One mistake gets one entry: if the reviewer and Jasper both catch it, both go in its Evidence line.

## 1. Reproduce it

Show the mistake before you explain it: run the failing check on the commit that had it, or quote the review line, the gate's output, the commit or Jasper's words. Cite `path:line` for what you read. Then work out the root cause: what the agent believed, and why nothing stopped it.

If you can't reproduce it, the Root cause line starts "Not reproduced:" with your best reading, and the rung is `none yet`, even on a repeat. A repeat you can't reproduce gets a `Postmortem:` ticket (step 4) that says so.

## 2. Find its class

Read the class table in `docs/agent-mistakes.md`. If a class file in `docs/agent-mistakes/` has the same root cause, this is a repeat. Otherwise it starts a new class. Two mistakes that look alike but have different root causes are different classes.

## 3. Pick the rung

Use the fix ladder in `docs/agent-mistakes.md`: design, then check, then rule file or skill, then CLAUDE.md line. It's the `correct` skill's ladder with its steps grouped. Climb from the top and stop at the first rung that would have stopped the original mistake.

- **First time in its class:** if the fix is small and obvious, build it now and log the rung it reaches. Otherwise log `none yet`.
- **A repeat:** build the fix. "Nothing yet" in the rules table, or an entry still at `none yet` or `CLAUDE.md line`, means the class is due.
- **Prove it.** A check must go red on the original case: put the old line back, or copy the original text into a test case, run it and see it fail; then run it on the fix and see it pass. A design fix shows the original mistake can no longer be written, such as the type error it now gets. Quote both runs in the PR.
- **A judgement call** no check can make goes in the reviewer's checklist in `.claude/agents/reviewer.md`, a `.claude/rules/` file or one of the repo's own skills. That's the `rule file or skill` rung. Never edit pstack's copied skills: `.claude/skills/pstack-manifest.test.mjs` fails, and the next pstack update would undo it.

The entry's Rung line names the rung that lands in this PR. A fix left to a ticket stays `none yet` until the ticket's own PR, which changes that entry's Rung and Fix lines, the class's row and the rules table.

## 4. Where it lands

- **The entry** goes in the PR where the mistake happened. A mistake caught outside a PR, such as a find in the weekly read or a correction in a session with no PR, gets a PR of its own.
- **The fix** goes in the same PR when it's small and doesn't put the PR on the risky list (`scripts/risky-paths.ts`). That list covers nearly every home of a check or a rule (lint rules, hooks, CI, agents, rule files, skills), and a PR that touches it is Jasper's to merge. A test under `src/` or most of `scripts/` stays off it.
- **A first time logged as `none yet`** gets no ticket: its Fix line says so, such as "none yet, as a first occurrence". The wellness check will watch for its repeat (JAS-65).
- **Otherwise** search Linear for an open `Postmortem:` ticket for this class first; if there's none, file one titled `Postmortem: <what>` in Backlog (team JAS, project Turnpoint), with the evidence and the rung you'd pick. Its ID goes in the entry's Fix line. If the Linear tools fail, put the ticket under a "Tickets to file" heading in the PR and don't merge until Jasper has filed it.
- **An entry added after the reviewer cleared the head** is a new commit, so the reviewer checks the new head before anyone merges.

## 5. Log it

Add a `## YYYY-MM-DD` section (today's date) at the end of the class file. A new class's file starts with a `#` title and one or two sentences on what the class is. Each entry has these five lines in this order:

```md
- **What happened:** what the agent did, and what should have happened.
- **Evidence:** a PR, commit, `path:line` or quoted output a reader can open.
- **Root cause:** what the agent believed, and why nothing stopped it.
- **Rung:** none yet
- **Fix:** the file or PR that holds the fix, or the ticket that will.
```

The Rung line holds exactly one of `design`, `check`, `rule file or skill`, `CLAUDE.md line` or `none yet`, written as plain words with no backticks or full stop.

Then update `docs/agent-mistakes.md`. In the class table, a new class gets a row `| [Title](agent-mistakes/<file>.md) | 1 | <rung> |`; a repeat's row gets the new count and the newest entry's rung. In the rules table, add or change a row when the fix adds a rule or changes what enforces one. `npx vitest run scripts/agent-mistakes.test.ts` fails when an entry or the class table is off; nothing checks the rules table, so read it over yourself.

## 6. Repo lessons live in the repo

A lesson about this repo (how its code, checks, tools or workflow behave) goes in the repo: the class file, plus the fix. Never only in Claude's memory notes, which only Jasper's PC loads and which drift. Memory keeps facts about Jasper and the status of work in progress. If you find a repo lesson in a memory note, log it here and say so in your report.

## Not this skill's job

- **No eval case.** There's no eval runner yet and each run costs API money (0016).
- **A sweep** of the whole repo for repeated mistakes is the `correct` skill's job. `retro` and `reflect` are Jasper's to start.

## Anti-patterns

- Stopping at the entry when a rule was within reach.
- Jumping to a skill or a CLAUDE.md line because a lint rule or test takes longer to write.
- A root cause that's the likeliest story instead of a reproduced one.
- A check with no run against the original case. It might not catch it.
- Skipping the entry because the fix is already in. Unlogged mistakes can't be counted as repeats.
- Calling your own mistake a flake, or a flake an agent mistake.
- Writing the lesson only to memory, or only in chat.

## Report

Tell Jasper, in one line each: the class and whether it's a repeat, the rung, and where the fix landed (this PR, or the `Postmortem:` ticket).
