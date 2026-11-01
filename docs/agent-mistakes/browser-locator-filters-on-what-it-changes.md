# A browser test's locator filters on what the click changes

Playwright looks a locator up again on every use. A locator found by a state the test then changes means a different element after the action, so the assertion can never pass.

## 2026-11-01

- **What happened:** JAS-107's smoke step found a mark by `[aria-pressed="false"]`, clicked it, then checked that same locator for `aria-pressed="true"`. It should have found the mark by something the click doesn't change, its `aria-label`.
- **Evidence:** reviewer blocker 1 on commit 764b283 (`e2e/smoke.spec.ts:66-71`); Smoke test run 41284988469 failed on both tries, `Expected: "true"`, `Received: "false"`, with the locator resolved to the 5:54 mark.
- **Root cause:** the builder treated the locator as the element it found first. The test can't run in a worktree with no database, so the first real run was the preview, after the push.
- **Rung:** none yet
- **Fix:** none yet, as a first occurrence. This PR finds the mark by its label after the click.
