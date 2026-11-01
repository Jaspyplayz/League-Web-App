# 0025: Risky PRs merge after the panel, except migrations, checks and one-way doors

Status: draft until Jasper merges JAS-128's PR, which he merges by hand, since it changes `scripts/can-merge*` and `scripts/risky-paths.ts`. It changes rule 6 and rule 7 of [0008](0008-agents-merge-two-way-doors.md)'s gate list; 0008 stays as it was written.

## Context

Since [0008](0008-agents-merge-two-way-doors.md), `npm run can-merge` refused any PR on the risky tier or touching a path in `scripts/risky-paths.ts`, so Jasper merged those by hand. On 2026-11-01 he said he doesn't review risky PRs before merging them: the `interrogate` panel and the reviewer agent are the confirmation, and his click only adds waiting (PRs 245, 247 and 248 sat on him that day). He chose to keep three kinds of PR his:

- **Anything that defines or runs a check**, since an agent could otherwise loosen its own gate and merge that.
- **Database migrations**, since only he runs `npm run db:migrate`.
- **One-way doors**, changes a revert doesn't fully undo. Until now a one-way door stayed his only because it took the risky tier, which can-merge refused, so this needed a gate of its own. He kept it when asked on 2026-11-01.

## Options considered

- **One list, each entry marked Jasper's or panel.** Smallest, but the first pattern that matches decides, so where an entry sits in the list would decide who merges it. Moving a line could open a check to agent merging.
- **Keep one list and only let the risky tier through.** A normal-tier PR that touches a risky path, like PR 245's sign-in page, would then merge with no panel at all.
- **Two lists, checked Jasper's first (chosen).** A path on both is Jasper's, a test fails if any path is on both, and a new file anywhere in `.claude/` lands on his list by default.

## Decision

`scripts/risky-paths.ts` holds two lists:

- **`JASPERS_PATHS`**: `drizzle/`, `drizzle.config.ts`, `.github/`, everything in `.claude/` (settings, hooks, agents, skills, rules, the merge switch, and any new folder), the two Cursor paths, lint, `tsconfig.json`, `next.config.ts`, `vercel.json`, `vitest.config.mts`, `playwright.config.ts`, `package.json`, `package-lock.json`, `scripts/can-merge*` and `scripts/risky-paths*`, plus a `.claude/` or `.cursor/` folder below the root.
- **`PANEL_PATHS`**: the rest of the risky code, as before: database code and the stores, sign-in, the Riot client, API routes, server actions, the MCP server, Ask and recaps, the trained models, privacy and terms, `globals.css` and its test, and `e2e/`.
- **`CARVED_OUT`**: `.claude/skills/verify-turnpoint-ux/features/*.md`, the verify skill's feature notes, which most redesign PRs update. They sit inside `.claude/skills/` but count as panel paths: agents follow them, so they still get the panel. Only Markdown: a script there could be run by the skill. The skill's `SKILL.md` and scripts stay Jasper's.

`e2e/` is on the panel list, as Jasper chose, though its specs are the smoke test. They're tests like the `.test.ts` files beside the code, which merge after the reviewer already. What makes the smoke test a gate stays Jasper's: which specs run and how (`playwright.config.ts`), that it runs and is required (`.github/workflows/`, `REQUIRED_CHECKS` in `scripts/can-merge-gates.ts`), and the commands (`package.json`). A weakened spec is a visible diff, which the panel and the reviewer read, and a change to `e2e/` after the verdict needs a new review.

`scripts/can-merge-gates.ts` changes four gates:

- **"Tier is tiny, normal or risky"** (was "Tiny or normal tier") accepts a risky tier. A missing or doubled tier still fails.
- **"No files Jasper merges"** (was "No risky files") refuses only `JASPERS_PATHS`, whatever the tier and the reviews.
- **"Two-way door"** (new) refuses a `**Door:**` line that says one-way, names both, or says neither. A PR that needs the panel must have the line; one that doesn't may leave it out.
- **"Interrogate panel ran"** (new) applies to a risky tier, a tier it can't read, or any path on either list. The Review section needs a line GitHub shows, starting `Interrogate panel at <sha>:`, and every such line must name the head or a commit the PR added (the same check the reviewer gate uses). The panel's "act on" count isn't read: the reviewer gate's no-blockers verdict at the head covers the fixes.

GitHub's required `reviewer` check is unchanged.

## Consequences

Good:

- A risky PR merges once its panel and reviewer clear it, without waiting for Jasper.
- A normal-tier PR that touches a risky path now needs the panel. Before, it needed Jasper.
- A one-way door is refused by a gate, not only by the tier the builder picked.

Bad:

- A redesign PR that only updates the feature notes now runs a panel it didn't run before, because the notes went from Jasper's to the panel, not off both lists.
- The panel line must start its own paragraph, or the reviewer's verdict under it can't be read. The template and `docs/workflow.md` say so.
- Two gates changed names, so older `docs/agent-mistakes/` entries quote names can-merge no longer prints.

## Open questions

1. Should the verify skill's other feature folders (`.claude/skills/verify/features/`, `.claude/skills/verify-turnpoint/features/`) get the same carve-out? Jasper named only `verify-turnpoint-ux`.
2. `.nvmrc` sets the Node version CI uses and is on neither list. Should it be Jasper's?
