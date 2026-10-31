# Agent mistakes

Each agent mistake that was caught, grouped by mistake class, and how it was fixed. The builder that made the mistake adds the entry, in the shape below, with the repo's [`postmortem` skill](../.claude/skills/postmortem/SKILL.md). On Jasper's PC, read it at that path: the older copy in `~/.claude/skills/` has the same name, Claude Code runs a personal skill over a project one, and that copy writes a one-row table this file no longer has. The words are defined under Workflow in [GLOSSARY.md](../GLOSSARY.md). Why it works this way: [0016](adr/0016-agent-mistakes-become-checks.md).

## Fix ladder

Strongest first. Stop at the first rung that would have stopped the original mistake ([pstack's `correct`](../.claude/skills/correct/SKILL.md) climbs in the same direction, with lint, CI and tests as separate steps where this ladder groups them as "check", and docs as one step where this splits them in two).

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

`scripts/agent-mistakes.test.ts` fails when an entry misses a line or names another rung, or when the table below doesn't match the files: a class missing, a row in another shape, or a wrong count or rung. The rung is the newest entry's, so it shows the latest fix, not that every case in the class is covered; a case still left to an instruction shows as "Nothing yet" in the rules table below.

| Class | Times seen | Rung |
| ----- | ---------- | ---- |
| [A guard that also blocks the repair](agent-mistakes/guard-blocks-its-own-repair.md) | 1 | check |
| [Re-review line written in the wrong shape](agent-mistakes/re-review-line-shape.md) | 1 | check |
| [Text read as if it had Unix line endings](agent-mistakes/windows-line-endings.md) | 1 | check |
| [Jasper's own writing listed as his to-do](agent-mistakes/owner-writing-listed-as-todo.md) | 2 | design |
| [Tier line names a second tier word](agent-mistakes/tier-line-names-two-tiers.md) | 4 | none yet |
| [A check left to a local session that the cloud could run](agent-mistakes/check-left-for-a-local-session.md) | 1 | CLAUDE.md line |
| [Merge Danger understated on a risky path](agent-mistakes/merge-danger-understated.md) | 3 | none yet |
| [A merge gate tested only on made-up inputs](agent-mistakes/gate-tested-only-on-fakes.md) | 6 | check |
| [Automation that merges before the builder is done](agent-mistakes/merge-before-the-builder-is-done.md) | 1 | design |

## Rules and what enforces them

A rule agents are given, next to what fails when they break it. A rule whose second column starts "Nothing yet" is one to climb the ladder on.

| Rule | Enforced by |
| ---- | ----------- |
| Riot API hosts appear only in `src/lib/riot/` | Lint rule `turnpoint/no-riot-api-host` |
| Files that read secrets import `"server-only"` | Lint rule `turnpoint/server-only-env` |
| No green in the UI | Lint rule `turnpoint/no-green-classes` |
| Lint and typecheck pass before Claude commits | The commit hook, `.claude/hooks/check-before-commit.mjs` |
| No PR merges before the reviewer clears it (its head, or an earlier commit with only small changes since) | GitHub's required `reviewer` check |
| The reviewer's re-review line has the shape the check reads | `scripts/can-merge-gates.ts`, test `names a verdict line it can't read` |
| A PR that touches the risky list is Jasper's to merge | `npm run can-merge`, which refuses it (`scripts/risky-paths.ts`) |
| The Agent merge workflow merges only a PR whose builder wrote `**Ready to merge:** yes` | `readyToMerge` in `scripts/can-merge-action-steps.ts` and its tests |
| Every agent mistake entry has all five lines | `scripts/agent-mistakes.test.ts` |
| Each line in the reviewer's Judgement calls checklist names a class file that exists | `scripts/agent-mistakes.test.ts` |
| Every reviewer blocker ends with a `Check could catch this:` line, kept in the PR's Review section | Nothing yet: `.claude/agents/reviewer.md` and `docs/workflow.md`; check 5 of [the wellness check](wellness.md#check-5-agent-mistakes) reads it twice a month |
| Every agent mistake gets an entry | Nothing yet: the `postmortem` skill and step 10 of `docs/workflow.md`; check 5 of [the wellness check](wellness.md#check-5-agent-mistakes) looks for missed ones twice a month |
| A cloud session tries a criterion, screenshot or review on the preview before leaving it to a local session | Nothing yet: `AGENTS.md`, Cloud sessions; `npm run can-merge` refuses an unticked criterion at merge time |
| Jasper's Dev Log why and what-I-learned lines are never listed as his to-do | Nothing yet: a line in Jasper's `~/.claude/CLAUDE.md` |
