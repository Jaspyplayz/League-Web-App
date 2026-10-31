# A throwing read moved onto a page that didn't expect it

A component that let a failure fall through to its own page's error screen is moved onto a page that holds much more, so the same failure now takes all of that down too.

## 2026-10-31

- **What happened:** JAS-105 moved Ask from its own profile tab into a panel on every analyzed match page, and kept the old page's `checkAllowance` call, which throws when a database read fails. On the old page that showed the error page for Ask alone; on the match page it would replace the whole analysis. The panel should have caught the failure and said so in its own space.
- **Evidence:** reviewer blocker 1 on commit 5a4b462 (`src/components/ask/ask-panel.tsx:98-101` with `src/lib/ask-store.ts:75-78`); decision record 0020 kept the throw because "the tab shows the error page".
- **Root cause:** the builder treated the move as a change of place and copied the old page's data loading as it was, without asking what a thrown error would now take down. Nothing tested the panel's failure states.
- **Rung:** check
- **Fix:** `src/components/ask/ask-panel.test.tsx`, test `says Ask couldn't load when the allowance read fails`, which fails with "pooler timeout" without the try/catch in `AskContent` and passes with it.
