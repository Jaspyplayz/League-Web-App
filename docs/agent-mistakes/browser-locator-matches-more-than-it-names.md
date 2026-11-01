# A browser test's locator matches more than it names

A broad locator can also match elements the test didn't mean, and which elements those are can change when the page does. A step that counts its way through the matches then clicks the wrong thing, and it passes every check that runs before a push, because Playwright runs only against a preview.

## 2026-11-01

- **What happened:** JAS-108's smoke step used `ol button` to mean the list's rows, so `.nth(1)` clicked the opened play's Watch in replay and left the Summary tab.
- **Evidence:** reviewer blocker on `1a67bbd`, Smoke test run 41290654589 failed on both tries at `e2e/smoke.spec.ts:109`.
- **Root cause:** the builder treated the locator as meaning rows and pushed it unrun, because `test:e2e` can't run against a preview from a worktree.
- **Rung:** none yet
- **Fix:** none yet, as a first occurrence. `10bf731` selects only rows, and the same locator was tried through `ux-game-review` on the preview before the push.
