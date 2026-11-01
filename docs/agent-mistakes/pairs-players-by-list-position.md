# Pairs players by their place in a list

Two sorted lists only line up when both are complete. Riot's roles can be blank or doubled, so pairing by index compares the wrong players and states a number that doesn't exist.

## 2026-11-01

- **What happened:** JAS-107's lane scoreboard paired `allies[i]` with `enemies[i]` after sorting each by role. With one blank role, an ally bot laner sat across from the enemy mid, and four of five rows stated a false gold gap. It should have paired by role and refused to claim lanes when the roles don't pair up.
- **Evidence:** reviewer blocker 3 on commit 764b283 (`lane-board.tsx:36-38,62,77`); `lane-board.test.tsx` on the old component: `Tests  4 failed | 4 passed (8)`, then `Tests  26 passed (26)` with the three scoreboard and chart test files on the fix.
- **Root cause:** the builder read the file's own comment, "analyzed games are always 5v5", as meaning one player in each role. Every test fixture had all five roles filled, so nothing tried a blank one.
- **Rung:** check
- **Fix:** `pairByLane` in `lane-board.tsx`, with tests for a blank and a doubled role in `lane-board.test.tsx`; those games get the two team tables.
