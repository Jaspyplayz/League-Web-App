# Agent mistakes

Each agent mistake that was caught, grouped by mistake class, and how it was fixed. The `postmortem` skill adds entries; the words are defined under Workflow in [GLOSSARY.md](../GLOSSARY.md). Why it works this way: [0016](adr/0016-agent-mistakes-become-checks.md).

## Fix ladder

Strongest first. Stop at the first rung that would have stopped the original mistake ([pstack's `correct`](../.claude/skills/correct/SKILL.md) uses the same order).

1. **design**: make the mistake impossible: one owner for the thing, one supported way, a type that can't hold the bad state.
2. **check**: a lint rule, test, hook or CI step that fails on the mistake, shown going red on the original case.
3. **rule file or skill**: for a judgement call no check can make: a line in the reviewer's checklist, a `.claude/rules/` file or a skill.
4. **CLAUDE.md line**: last resort, one sentence.

A first mistake in a class is logged with the rung `none yet` unless the fix is small and obvious. A repeat gets the fix.

## Entries

One file per mistake class in [`agent-mistakes/`](agent-mistakes/), so two PRs that log different classes don't conflict. The file starts with a `#` title and one or two sentences saying what the class is. Each occurrence is a `## YYYY-MM-DD` section with these five lines, in this order:

```md
- **What happened:** what the agent did, and what should have happened.
- **Evidence:** a PR, commit, `path:line` or quoted output a reader can open.
- **Root cause:** what the agent believed, and why nothing stopped it.
- **Rung:** design, check, rule file or skill, CLAUDE.md line, or none yet.
- **Fix:** the file or PR that holds the fix, or the ticket that will.
```

`scripts/agent-mistakes.test.ts` fails when an entry misses a line or names another rung, or when a class file isn't listed below.

| Class | Times seen | Rung |
| ----- | ---------- | ---- |
| [Re-review line written in the wrong shape](agent-mistakes/re-review-line-shape.md) | 1 | check |

## Rules and what enforces them

A rule agents are given, next to what fails when they break it. A rule with nothing in the second column is one to climb the ladder on.

| Rule | Enforced by |
| ---- | ----------- |
| Riot API hosts appear only in `src/lib/riot/` | Lint rule `turnpoint/no-riot-api-host` |
| Files that read secrets import `"server-only"` | Lint rule `turnpoint/server-only-env` |
| No green in the UI | Lint rule `turnpoint/no-green-classes` |
| Lint and typecheck pass before Claude commits | The commit hook, `.claude/hooks/check-before-commit.mjs` |
| No PR merges before the reviewer clears its head commit | GitHub's required `reviewer` check |
| The reviewer's re-review line has the shape the check reads | `scripts/can-merge-gates.ts`, test `names a verdict line it can't read` |
| A PR that touches the risky list is Jasper's to merge | `npm run can-merge`, which refuses it (`scripts/risky-paths.ts`) |
| Every agent mistake entry has all five lines | `scripts/agent-mistakes.test.ts` |
