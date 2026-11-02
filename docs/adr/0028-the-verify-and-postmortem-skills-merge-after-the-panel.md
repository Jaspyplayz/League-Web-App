# 0028: The verify and postmortem skills' Markdown merges after the panel

Status: draft until Jasper merges JAS-146's PR, which he merges by hand, since it changes `scripts/risky-paths.ts`. It changes [0025](0025-risky-prs-merge-after-the-panel.md)'s `FEATURE_NOTE` and answers its open question 1; that record stays as it was written.

## Context

[0025](0025-risky-prs-merge-after-the-panel.md) put all of `.claude/skills/` on Jasper's list, apart from `FEATURE_NOTE`: the Markdown notes in `.claude/skills/verify-turnpoint-ux/features/`, but not that folder's README, which says what counts as a pass. Of the 61 Claude PRs merged from 205 to 266 (2026-10-29 to 11-01), 30 touched Jasper's list, 16 of them in `.claude/skills/`, and 8 for no other reason: 214, 220, 229, 237, 256, 257, 259 and 260. On 2026-11-01 Jasper said much of the list isn't really risky, and asked to let Claude merge the Markdown in the skills those PRs changed once the panel and the reviewer clear it. The ticket accepted that this takes in each skill's `SKILL.md` and READMEs.

A `SKILL.md` does more than steer. Claude Code's skill docs (read 2026-11-02) say its frontmatter can grant tools without asking (`allowed-tools`), register `hooks` for the rest of the session, and run the skill as another agent (`context: fork` with `agent`). Its body runs shell commands as it loads: the Claude Code installed in cloud sessions (2.1.316) runs every ```` ```! ```` block anywhere in the file, and an older one (2.1.42) runs `` !`cmd` `` after almost any character. Its `name` could take another skill's, such as `code-review-and-quality`, which the reviewer loads.

## Options considered

- **The feature notes of all three verify skills.** The smallest step from 0025, but 229 changed only `verify/SKILL.md` and 214 only `postmortem/SKILL.md` and the credits, so most of the 8 would still wait.
- **The whole folders.** Takes in `scripts/drive.ts`, which the skills run, so it's a script like any other on Jasper's list.
- **Markdown in the named folders, with tests on its names, its file type and each `SKILL.md` (chosen).**

## Decision

`PANEL_SKILLS` in `scripts/risky-paths.ts` names `verify`, `verify-turnpoint`, `verify-turnpoint-ux` and `postmortem`. It's carved out of the `.claude/skills/` entry on Jasper's list, and only where that entry is the one that matches, so a narrower entry added to his list later still wins. These go to the panel:

- In one of those folders, its `SKILL.md`, and a `README.md` or a note named in lower-case words joined by hyphens, like `match-page.md`. The same in its `features/`, apart from `SKILL.md`. This reverses 0025's choice to keep the README Jasper's.
- `.claude/skills/THIRD-PARTY-NOTICES.md`: the copied skills' credits, and notes on how they fit this repo (the repo's rules win over a skill's, and the copied folders aren't edited).

`FEATURE_NOTE` folds into this. Everything else stays Jasper's:

- Anything that isn't Markdown, such as `scripts/drive.ts`.
- A name in any other shape: capitals, a dot, a space, another alphabet or an invisible character, which a Windows or Mac file system could fold into `CLAUDE.md` or `SKILL.md`. A name starting with claude, agent, skill or gemini, which Claude Code or another AI tool loads by itself.
- A `.claude/` folder, and any subfolder other than `features/`.
- `..`, a backslash, or a listed folder in other capitals, which on Linux is another folder, so a new skill.
- Every other skill folder, a new one, and `explain-back`, which the ticket named but PR 220 deleted. Naming it would only let a re-created `explain-back` skill merge without Jasper.

Two tests in `scripts/risky-paths.test.ts` guard what the path can't show:

- Each of these files is a plain file in Git, not a symlink. A symlink could point at a file a docs-only PR can change, or at a secret, and one named like the credits that points at a folder would load that folder as a skill.
- Each listed skill's `SKILL.md` has only `name: <its folder>` and a one-line `description`, and no `` !` `` or ```` ```! ```` anywhere.

The test file is Jasper's, so a listed skill that wants tools, hooks, another agent, another name or a command waits for him, as a script would.

## Consequences

Good:

- Re-run over the same 61 PRs, 26 touch Jasper's list instead of 30: 214, 229, 237 and 257 come off. 256, 259 and 260 stay, because each also changed a skill's `scripts/drive.ts`, and 220 stays for `explain-back`.
- 0025's open question 1 is answered: all three verify skills' feature folders are panel paths.

Bad:

- A `SKILL.md`, README or note can still change what counts as a pass, and how agents gather evidence, with only the panel and the reviewer reading it. Neither can change `can-merge`'s gates.
- That Markdown can also tell an agent to run a command: one Jasper keeps for himself, such as `npm run db:migrate`, or a new script outside `.claude/`, which is on neither list. The agent asks permission as for any command, but only the panel and the reviewer read the instruction. Only commands Claude Code runs as the skill loads wait for Jasper.
- The test knows the ways a `SKILL.md` runs a command in the Claude Code versions installed today. A new way added in a later version would get through until someone adds it to the test. `"disableSkillShellExecution": true` in `.claude/settings.json` would switch them off for every skill, Jasper's own included; this record doesn't make that choice.
- A note whose name isn't lower-case words, or a listed path in other capitals such as `verify-turnpoint-ux/Features/x.md`, goes to Jasper. Under 0025 the second one went to the panel.
