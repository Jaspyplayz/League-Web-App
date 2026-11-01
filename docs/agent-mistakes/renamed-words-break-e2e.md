# Renamed words on a page break the browser tests

The tests in `e2e/` find tabs, buttons and headings by the words on them. A change that renames those words in `src/` and leaves `e2e/` alone passes lint, typecheck, the unit tests and the build, then fails only on the Vercel preview, after a deploy.

## 2026-11-01

- **What happened:** JAS-105 renamed the match page's "Deep dive" tab to "Replay" and left `e2e/smoke.spec.ts:65` and `e2e/jas20-surfaces.spec.ts:67-68` clicking "Deep dive". The smoke test failed on the preview; the builder fixed that one, and the second, which runs only with `JAS20_SHOTS=1`, reached main in PR 248.
- **Evidence:** smoke run 41209454563 on [PR 248](https://github.com/Jaspyplayz/League-Web-App/pull/248), fixed in ec638e6; `git grep -n "Deep dive" 7073b75 -- e2e` finds `e2e/jas20-surfaces.spec.ts:67` and `:68`. `npx vitest run src/app/e2e-text.test.ts` on the src and e2e of ec638e6^: `e2e\smoke.spec.ts looks for "Deep dive", which no file in src/ says`, 1 failed.
- **Root cause:** the builder's brief from the parent session said not to touch `smoke.spec.ts`, and nothing that runs before a push compares the words in `e2e/` with the pages, since Playwright runs only against a preview.
- **Rung:** check
- **Fix:** `src/app/e2e-text.test.ts` (JAS-130) fails `npm test` when a quoted name in `e2e/` is in no string or JSX text under `src/`; this PR also fixes `e2e/jas20-surfaces.spec.ts`. It can't tell which page says the words, so renaming a tab that the loading skeleton also names stays green, and it doesn't read names held in a variable or a regex.
