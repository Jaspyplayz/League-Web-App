# A browser test's locator matches more than it names

A broad locator can also match elements the test didn't mean, and which elements those are can change when the page does. A step that counts its way through the matches then clicks the wrong thing, and it passes every check that runs before a push, because Playwright runs only against a preview.

## 2026-11-01

- **What happened:** JAS-108's smoke step used `ol button` to mean the list's rows, so `.nth(1)` clicked the opened play's Watch in replay and left the Summary tab.
- **Evidence:** reviewer blocker on `1a67bbd`, Smoke test run 41290654589 failed on both tries at `e2e/smoke.spec.ts:109`.
- **Root cause:** the builder treated the locator as meaning rows and pushed it unrun, because `test:e2e` can't run against a preview from a worktree.
- **Rung:** none yet
- **Fix:** none yet, as a first occurrence. `10bf731` selects only rows, and the same locator was tried through `ux-game-review` on the preview before the push.

## 2026-11-01

- **What happened:** JAS-116's spec looked for the Riot ID box across the whole page after opening a player Riot doesn't know (`be7cc12`). Once that page showed its own search there were two boxes, so filling the header's failed with a strict mode violation.
- **Evidence:** Smoke test run 41298541245 at `e2e/saved-players.spec.ts:134`, `resolved to 2 elements`. The line is in the logs of 6 of 14 runs, and on `/player/na/Turnpoint%20Tester-NA1` the old locator matches 2 boxes and PR 264's matches 1.
- **Root cause:** the builder treated the locator as meaning the header's box, and it was the only one until Riot's answer arrived, so the spec passed whenever the test got there first. Only a preview shows that, and a passing retry hid it.
- **Rung:** none yet
- **Fix:** JAS-153, which covers running a spec against its preview before it's marked ready. PR 264 scopes this test to the header's form.
