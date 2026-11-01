# 0025: Risky PRs merge after the panel, except migrations, checks and one-way doors

Status: draft until Jasper merges JAS-128's PR, which he merges by hand, since it changes `scripts/can-merge*` and `scripts/risky-paths.ts`. It changes rule 6 and rule 7 of [0008](0008-agents-merge-two-way-doors.md)'s gate list, the database code [0009](0009-can-merge-covers-database-code-and-tiny-code.md) refused, and [0022](0022-the-review-board-look-arrives-by-expand-and-contract.md)'s "Jasper merges changes to the palette"; those records stay as they were written.

## Context

Since [0008](0008-agents-merge-two-way-doors.md), `npm run can-merge` refused any PR on the risky tier or touching a path in `scripts/risky-paths.ts`, so Jasper merged those by hand. On 2026-11-01 he said he doesn't review risky PRs before merging them: the `interrogate` panel and the reviewer agent are the confirmation, and his click only adds waiting (PRs 245, 247 and 248 sat on him that day). He chose to keep three kinds of PR his:

- **Anything that defines or runs a check**, since an agent could otherwise loosen its own gate and merge that.
- **Database migrations**, since only he runs `npm run db:migrate`.
- **One-way doors**, changes a revert doesn't fully undo. Until now a one-way door stayed his only because it took the risky tier, which can-merge refused, so this needed a gate of its own. He kept it when asked on 2026-11-01.

## Options considered

- **One list, each entry marked Jasper's or panel.** Smallest, but the first pattern that matches decides, so where an entry sits in the list would decide who merges it. Moving a line could open a check to agent merging.
- **Keep one list and only let the risky tier through.** A normal-tier PR that touches a risky path, like PR 245's sign-in page, would then merge with no panel at all.
- **Two lists, checked Jasper's first (chosen).** A file named on his list stays his inside a panel folder, such as `src/db/schema.ts` in `src/db/`, and a new file anywhere in `.claude/` lands on his list by default.

## Decision

`scripts/risky-paths.ts` holds two lists:

- **`JASPERS_PATHS`**: `drizzle/`, `drizzle.config.ts`, `src/db/schema.ts` (migrations are generated from it, and nothing checks that one was), `.github/`, everything in `.claude/` (settings, hooks, agents, skills, rules, the merge switch, and any new folder), the two Cursor paths, lint, the TypeScript, Next.js, Vitest and Playwright configs under any file name (each tool loads other names first, so an `eslint.config.js` would replace the `.mjs`), `vercel.json`, `src/app/themes.test.ts`, the three `e2e/` files that hold or guard the preview's bypass secret, `package.json`, `package-lock.json`, `.npmrc`, `.nvmrc`, `.mcp.json`, `scripts/can-merge*` and `scripts/risky-paths*`, plus a `.claude/` or `.cursor/` folder below the root.
- **`PANEL_PATHS`**: the rest of the risky code, as before: database code and the stores, sign-in, the Riot client, API routes, server actions, the MCP server, Ask and recaps, the trained models, privacy and terms, `globals.css`, and the rest of `e2e/`.
- **`FEATURE_NOTE`**: `.claude/skills/verify-turnpoint-ux/features/*.md`, the verify skill's feature notes, which most redesign PRs update. They sit inside `.claude/skills/` but count as panel paths: agents follow them, so they still get the panel. Only Markdown notes directly in that folder: a script there could be run by the skill, a subfolder could hold a skill of its own, and the folder's README says what counts as a pass. The skill's `SKILL.md`, scripts and that README stay Jasper's.

`e2e/` is on the panel list, as Jasper chose, though its specs are the smoke test. They're tests like the `.test.ts` files beside the code, which merge after the reviewer already. What makes the smoke test a gate stays Jasper's: which specs run and how (`playwright.config.ts`), that it runs and is required (`.github/workflows/`, `REQUIRED_CHECKS` in `scripts/can-merge-gates.ts`), and the commands (`package.json`). So do the files that send the preview's bypass secret and check it goes nowhere else. A weakened spec is a visible diff, which the panel and the reviewer read, and a change to `e2e/` after the verdict needs a new review.

`scripts/can-merge-gates.ts` changes five gates:

- **"Tier is tiny, normal or risky"** (was "Tiny or normal tier") accepts a risky tier. A missing or doubled tier still fails.
- **"No files Jasper merges"** (was "No risky files") refuses only `JASPERS_PATHS`, whatever the tier and the reviews.
- **"Two-way door"** (new) fails closed, since refusing a two-way PR costs Jasper a click and merging a one-way door can't be undone. It refuses any line that could pass for the Door line and says one-way, such as `- **Door:** one-way`, at any tier. The real line must start with two-way and never say one-way, even in its reason. Every PR needs it, except a tiny one with no risky paths.
- **"Interrogate panel ran"** (new) applies to a risky tier, a tier it can't read, or any path on either list. The Review section needs a line GitHub shows, starting `Interrogate panel at <sha>: <n> to act on`, so one saying it could not run doesn't count. Every such line must name the head or a commit the PR added (the same check the reviewer gate uses), and each risky file the PR changes must already be in the PR at one of those commits, since a panel can't have read a file the PR hadn't touched. Later fixes to those files are the reviewer's to check. The panel's "act on" count isn't read: the reviewer gate's no-blockers verdict at the head covers the fixes.
- **"Acceptance criteria ticked"** skips only a tiny PR with no risky paths, so calling a change to sign-in tiny doesn't skip it.

`.claude/agents/reviewer.md` check 8 makes a one-way door labelled two-way a blocker on every tier, since the gate reads only the label.

GitHub's required `reviewer` check is unchanged, and so is workflow step 3: a risky plan still waits for Jasper's yes, so he hears about a risky change before it's built, not after.

## Consequences

Good:

- A risky PR merges once its panel and reviewer clear it, without waiting for Jasper.
- A normal-tier PR that touches a risky path now needs the panel. Before, it needed Jasper.
- A one-way door is refused by a gate, not only by the tier the builder picked.

Bad:

- A redesign PR that only updates the feature notes now runs a panel it didn't run before, because the notes went from Jasper's to the panel, not off both lists.
- The panel line must start its own paragraph, or the reviewer's verdict under it can't be read. The template and `docs/workflow.md` say so.
- Two gates changed names, so older `docs/agent-mistakes/` entries quote names can-merge no longer prints.
- The panel line and the reviewer's verdict are text the builder writes, and nothing ties either to a real run. With Jasper's click gone from these PRs, a builder that writes them without running the reviews merges unreviewed. GitHub's `reviewer` check reads the same text.
- The panel's "act on" findings aren't tied to any fix. The reviewer's verdict reads the diff, not the panel's report, so a finding the reviewer doesn't raise itself can merge unfixed.
- A one-way door labelled two-way merges unless the reviewer catches it. JAS-69, a gate that compares the Door line with the diff, isn't built, and PR 218 shows the mislabel has happened.
- By the template, code that writes rows or spends on Claude is a one-way door, though the stores and Ask are on the panel list. So an honest PR that adds such a write stays Jasper's. Only one that adds none merges on its own.
- Any spec in `e2e/` can read the preview's bypass secret from the environment, as `e2e/mcp.spec.ts` does. The three listed files are Jasper's, but a new spec that sends the secret elsewhere is caught only by the panel and the reviewer, and by `e2e/fixtures.ts` at run time for pages it opens.

## Open questions

1. Should the verify skill's other feature folders (`.claude/skills/verify/features/`, `.claude/skills/verify-turnpoint/features/`) get the same carve-out? Jasper named only `verify-turnpoint-ux`.
2. Other files that act like checks or handle a secret are on neither list, as they were before this change: `scripts/agent-mistakes.test.ts`, `src/lib/analyzer/golden.test.ts`, `scripts/wellness*`, and `scripts/shot.ts` and `scripts/preview.ts`, which send the bypass secret and pick where it goes. Should they be Jasper's?
