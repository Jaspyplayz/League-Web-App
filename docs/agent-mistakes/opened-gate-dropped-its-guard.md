# Opening a gate without keeping what it quietly guarded

A gate that refuses a whole group of PRs also does jobs nobody wrote down for it. This class is a change that lets that group through, and so stops doing one of those jobs.

## 2026-11-01

- **What happened:** PR 251 let risky PRs merge on their own and added a gate that reads the `**Door:**` line, but left the reviewer's Merge Danger check saying a one-way door is a blocker only "on a tiny or normal PR". A one-way door labelled two-way on a risky tier would have merged with nothing checking the label.
- **Evidence:** the reviewer agent's report at `50d75be` on [PR 251](https://github.com/Jaspyplayz/League-Web-App/pull/251), blocker 1, quoting `.claude/agents/reviewer.md:86`.
- **Root cause:** Claude saw that the risky tier's refusal kept honest one-way doors with Jasper, and replaced that with a gate on the label. It didn't see that the refusal also covered mislabelled ones on that tier, because a rule that said "tiny or normal" read as being about those tiers, not about what the refusal was doing for the third.
- **Rung:** rule file or skill
- **Fix:** `.claude/agents/reviewer.md` check 8 now makes a mislabelled door a blocker on any tier. A check that compares the line with the diff is JAS-69, which is already filed.

## 2026-11-01

- **What happened:** PR 251 put `src/app/themes.test.ts` on the panel list, so Claude could merge a change to the test that guards the palette, against the ticket's "refuses any PR touching a check-defining path".
- **Evidence:** the reviewer agent's report at `50d75be` on [PR 251](https://github.com/Jaspyplayz/League-Web-App/pull/251), blocker 2; the list's own reason for the file at `50d75be` was "the check that every colour has a light value".
- **Root cause:** Claude sorted the old list by the ticket's named groups, and that file sat beside `globals.css` under "the look's foundations". Nothing asked of each entry whether its own reason called it a check.
- **Rung:** check
- **Fix:** `src/app/themes.test.ts` is on `JASPERS_PATHS`, pinned by the tests "keeps migrations and every check-defining path Jasper's to merge" and "still refuses %s with a panel line and a clean verdict at the head, in every tier". Putting it back on the panel list turned both red. On 2026-11-02 Jasper chose to let every check but the merge gates merge after the panel (JAS-191, decision record 0032), so it's on the panel list again on purpose, and the first test is gone.

## 2026-11-01

- **What happened:** PR 251 kept `src/db/schema.ts` on the panel list, so a change to a table with no migration could merge on its own and break the live site's reads until Jasper ran one.
- **Evidence:** the reviewer agent's report at `50d75be` on [PR 251](https://github.com/Jaspyplayz/League-Web-App/pull/251), blocker 3.
- **Root cause:** Claude read "migrations stay Jasper's" as `drizzle/` and `drizzle.config.ts`. Refusing all of `src/db/` had also kept the schema and its migration together, and no check compares them.
- **Rung:** check
- **Fix:** `src/db/schema.ts` is on `JASPERS_PATHS`, pinned by the same two tests. A new CI step that fails when `drizzle-kit generate` would produce a file would let it come off the list; that's for Jasper to ask for.
