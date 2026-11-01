# A server answer read once and kept for the page's life

A client component fetches something from the server, then decides whether to fetch again from what it sent. Anything else that can change the answer, such as a button on another part of the page, never shows until a full reload.

## 2026-11-01

- **What happened:** The saved players box (JAS-116) asked `/api/saved-players` once per list of players. Its "You" row comes from the same answer, and the header's search stays mounted when "This is me" is pressed, so the row didn't appear until a reload. It should have asked again each time the box opened.
- **Evidence:** PR 256, reviewer blocker 1 at 95ffad8, `src/components/saved-players-box.tsx:55` (`if (!wanted || fetchedKey === listKey) return;`). Putting that guard back makes `asks the server again each time it opens` in `e2e/saved-players.spec.ts` fail on `Expected: visible`.
- **Root cause:** The builder treated the list of players as the whole input to the answer, to save queries, and forgot the signed-in account is an input too. `src/app/account/actions.ts:41` calls `refresh()`, which keeps client state, and no test opened the box twice.
- **Rung:** check
- **Fix:** `e2e/saved-players.spec.ts` in PR 256 closes and reopens the box against a faked answer and expects a second request and the new row. It runs on every preview.
