# A control tested only as static markup

A rule that decides what a control shows is tested by rendering HTML once. Nothing clicks the control, so a rule that also fires in the case it wasn't meant for leaves a button that does nothing.

## 2026-11-01

- **What happened:** A fix for a false "no match" message in the saved players box (JAS-116) made a tab fall through to the other tab when its list had no match. With nothing typed, an empty list has no match either, so clicking Pinned with Pinned empty did nothing, and the same for Recent. It should only have fallen through when something was typed.
- **Evidence:** PR 256, reviewer blocker 1 at 050d319, `src/components/saved-players-box.tsx:104`. Removing `typed &&` from that line makes `a tab with nobody on it can still be opened` in `e2e/saved-players.spec.ts` fail.
- **Root cause:** The builder thought about the typing case only. `saved-players-box.test.tsx` renders static markup, so it can't click, and the journey clicks Pinned only when Pinned has someone on it.
- **Rung:** check
- **Fix:** `e2e/saved-players.spec.ts` in PR 256 opens the box with Pinned empty, clicks Pinned, and expects it selected with its hint showing. It runs on every preview.
