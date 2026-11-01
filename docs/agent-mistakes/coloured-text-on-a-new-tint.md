# Coloured text on a tint nobody checked it against

A text colour that passes on a panel can fail once a row's tint sits under it. The design rules warn about this for the blue and red tints, and `select` does the same.

## 2026-11-01

- **What happened:** JAS-107's lane scoreboard tinted your row with `bg-select`, and your opponent's red "Opponent" tag sits in that row, because they play your lane. It should have outlined your row, as `.claude/rules/design.md` says views of both teams do.
- **Evidence:** reviewer blocker 2 on commit 764b283; `e2e/accessibility.spec.ts:81` in Smoke test run 41284988469 reported color-contrast on 1 element, first `.sm\:mr-1\.5`, the tag. It's about 4.25:1 in dark, under the 4.5:1 limit.
- **Root cause:** the builder copied the tint from the prototype, which never ran the scan, and read the rule's contrast warning as being about blue and red tints only. The scan only runs on the preview, so nothing could stop it before the push.
- **Rung:** none yet
- **Fix:** none yet, as a first occurrence. This PR outlines your row instead of tinting it.
