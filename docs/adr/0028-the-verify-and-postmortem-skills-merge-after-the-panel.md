# 0028: The verify and postmortem skills' Markdown merges after the panel

Status: draft until Jasper merges JAS-146's PR, which he merges by hand, since it changes `scripts/risky-paths.ts`. It changes [0025](0025-risky-prs-merge-after-the-panel.md)'s `FEATURE_NOTE` and answers its open question 1; that record stays as it was written.

## Context

[0025](0025-risky-prs-merge-after-the-panel.md) put all of `.claude/skills/` on Jasper's list, apart from `FEATURE_NOTE`: the Markdown notes in `.claude/skills/verify-turnpoint-ux/features/`. Of the 61 Claude PRs merged from 205 to 266 (2026-10-29 to 11-01), 30 touched Jasper's list, 16 of them in `.claude/skills/`, and 8 for no other reason: 214, 220, 229, 237, 256, 257, 259 and 260. On 2026-11-01 Jasper said much of the list isn't really risky, and asked to let Claude merge the Markdown in the skills those PRs changed once the panel and the reviewer clear it.

A skill's `SKILL.md` does more than steer. Claude Code's skill docs (read 2026-11-02) say its frontmatter can grant tools without asking (`allowed-tools`), register `hooks` for the rest of the session, and run the skill as another agent (`context: fork` with `agent`), and its body can run shell commands as it loads (`` !`cmd` `` or a block opening ```` ```! ````). Its `name` could take another skill's, such as `code-review-and-quality`, which the reviewer loads.

## Options considered

- **The feature notes of all three verify skills.** The smallest step from 0025, but 229 changed only `verify/SKILL.md` and 214 only `postmortem/SKILL.md` and the credits, so most of the 8 would still wait.
- **The whole folders.** Takes in `scripts/drive.ts`, which the skills run, so it's a script like any other on Jasper's list.
- **Markdown in the named folders, with a test on each `SKILL.md` (chosen).**

## Decision

`PANEL_SKILLS` in `scripts/risky-paths.ts` names `verify`, `verify-turnpoint`, `verify-turnpoint-ux` and `postmortem`. A Markdown file directly in one of those folders, or in its `features/`, is a panel path, and so is `.claude/skills/THIRD-PARTY-NOTICES.md`, which only credits the copied skills. `FEATURE_NOTE` folds into this. These stay Jasper's:

- Anything that isn't Markdown, such as `scripts/drive.ts`.
- A CLAUDE or AGENTS file, a `.claude/` folder, any subfolder other than `features/`, and a SKILL file anywhere except the folder's own `SKILL.md` spelled exactly so, since a `skill.md` beside it would replace it on Windows or a Mac.
- Any other spelling of a listed path: other capitals (`Verify/`, `Features/`, `.MD`), a backslash, or `..`. On Linux, other capitals make a different folder, so a new skill.
- Every other skill folder, a new one, and `explain-back`, which the ticket named but PR 220 deleted. Naming it would only let a re-created `explain-back` skill merge without Jasper.

A test in `scripts/risky-paths.test.ts` keeps each listed skill's `SKILL.md` to `name: <its folder>` and a one-line `description`, with no shell command. The test file is Jasper's, so a listed skill that wants tools, hooks, another agent, another name or a command waits for him, as a script would.

## Consequences

Good:

- Re-run over the same 61 PRs, 26 touch Jasper's list instead of 30: 214, 229, 237 and 257 come off. 256, 259 and 260 stay, because each also changed a skill's `scripts/drive.ts`, and 220 stays for `explain-back`.
- 0025's open question 1 is answered: all three verify skills' feature folders are panel paths.

Bad:

- A `SKILL.md` or README can still change what counts as a pass, and how agents gather evidence, with only the panel and the reviewer reading it. Neither can change `can-merge`'s gates.
- The test knows the ways a `SKILL.md` can run a command that Claude Code's docs list today. A new way added in a later version would get through until someone adds it to the test.
- A listed path in other capitals, such as `verify-turnpoint-ux/Features/x.md`, went to the panel under 0025 and now goes to Jasper.
