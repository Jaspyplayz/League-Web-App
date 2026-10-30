---
name: postmortem
description: Log an agent mistake in docs/agent-mistakes/ and pick its fix from the fix ladder. Start it yourself, in the same session, as soon as one is caught - a reviewer blocker, a failed can-merge gate or CI check your change caused (not a flaky test or an outage), Jasper correcting you, or a find in Jasper's weekly read of merged PRs - or when someone says "postmortem this".
---

# Postmortem

Every agent mistake should make the next one less likely. A mistake that's only logged repeats; one that becomes a check can't. So log every one, and build the fix on a repeat, or sooner when it's cheap. The words (agent mistake, mistake class, repeat, rung) are defined under Workflow in `GLOSSARY.md`, and why it works this way is in `docs/adr/0016-agent-mistakes-become-checks.md`.

## What counts

- A blocker from the reviewer agent.
- A failed `npm run can-merge` gate or CI check that your change caused. A flaky test, a GitHub or Vercel outage, or an expired Riot key isn't one.
- Jasper correcting you or another agent.
- A find in Jasper's weekly read of the PRs Claude merged.

The builder that made the mistake runs this, in the same session, when it's caught. The Postmortem step in `docs/workflow.md` checks before merging that none was missed.

## 1. Reproduce it

Show the mistake before you explain it: run the failing check on the commit that had it, or quote the review line, the gate's output, the commit or Jasper's words. Cite `path:line` for what you read. Then write the root cause: what the agent believed, and why nothing stopped it.

If you can't reproduce it, the Root cause line starts "Not reproduced:" with your best reading, and the rung stays `none yet`.

## 2. Find its class

Read the class table in `docs/agent-mistakes.md`. If a class file in `docs/agent-mistakes/` has the same root cause, this is a repeat: add your entry to that file. Otherwise make a new file, `docs/agent-mistakes/<short-name>.md`, starting with a `#` title and one or two sentences on what the class is. Two mistakes that look alike but have different root causes are different classes.

## 3. Log it

Add a `## YYYY-MM-DD` section (today's date) at the end of the class file, with these five lines in this order:

```md
- **What happened:** what the agent did, and what should have happened.
- **Evidence:** a PR, commit, `path:line` or quoted output a reader can open.
- **Root cause:** what the agent believed, and why nothing stopped it.
- **Rung:** design, check, rule file or skill, CLAUDE.md line, or none yet.
- **Fix:** the file or PR that holds the fix, or the ticket that will.
```

The Rung line holds exactly one of those five, written the same way. Then update `docs/agent-mistakes.md`: the class's row in the class table (Times seen is the file's number of entries; Rung is the newest entry's), and its rules table when the fix adds a rule or changes what enforces one. `npx vitest run scripts/agent-mistakes.test.ts` fails when any of this is off.

## 4. Pick the rung

Use the fix ladder in `docs/agent-mistakes.md`: design, then check, then rule file or skill, then CLAUDE.md line. It's the `correct` skill's ladder with its steps grouped. Climb from the top and stop at the first rung that would have stopped the original mistake.

- **First time in its class:** log it with `none yet`, unless the fix is small and obvious. Then build it now.
- **A repeat:** build the fix. "Nothing yet" in the rules table, or an entry still at `none yet` or `CLAUDE.md line`, means the class is due.
- **A check** must go red on the original case. Put the old line back, or copy the original text into a test case, run it and see it fail; then run it on the fix and see it pass. Quote both runs in the PR.
- **A judgement call** no check can make goes in the reviewer's checklist in `.claude/agents/reviewer.md`, a `.claude/rules/` file or one of the repo's own skills. That's the `rule file or skill` rung. Never edit pstack's copied skills: `.claude/skills/pstack-manifest.test.mjs` fails, and the next pstack update would undo it.

## 5. Where it lands

- **The entry** goes in the PR where the mistake happened. A find in the weekly read is about a merged PR, so its entry gets a PR of its own.
- **The fix** goes in the same PR when it's small and doesn't raise the PR's tier. A fix in a path on the risky list (`scripts/risky-paths.ts`, which covers `.claude/skills/`, `.claude/agents/`, `.claude/rules/` and `.claude/hooks/`) raises a tiny or normal PR to risky.
- **Otherwise** file a Linear ticket titled `Postmortem: <what>` in Backlog (team JAS, project Turnpoint), with the evidence and the rung you'd pick, and put it in the entry's Fix line. If the Linear tools fail, say so in the PR so Jasper can file it.
- **The PR** names each entry in its summary and puts the rung's red and green runs under Tested.

## 6. Repo lessons live in the repo

A lesson about this repo (how its code, checks, tools or workflow behave) goes in the repo: the class file, plus the fix. Never only in Claude's memory notes, which only Jasper's PC loads and which drift. Memory keeps facts about Jasper and the status of work in progress. If you find a repo lesson in a memory note, log it here and say so in your report.

## Not this skill's job

- **No eval case.** There's no eval runner yet and each run costs API money (0016).
- **A sweep** of the whole repo for repeated mistakes is the `correct` skill's job. `retro` and `reflect` are Jasper's to start.

## Anti-patterns

- Stopping at the entry when the class is a repeat and a rule was within reach.
- Jumping to a skill or a CLAUDE.md line because a lint rule or test takes longer to write.
- A root cause that's the likeliest story instead of a reproduced one.
- A check with no run against the original case. It might not catch it.
- Skipping the entry because the fix is already in. Unlogged mistakes can't be counted as repeats.
- Calling your own mistake a flake, or a flake an agent mistake.
- Writing the lesson only to memory, or only in chat.

## Report

Tell Jasper, in one line each: the class and whether it's a repeat, the rung, and where the fix landed (this PR, or the `Postmortem:` ticket).
