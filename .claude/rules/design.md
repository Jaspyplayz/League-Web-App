---
paths:
  - "src/app/**/*.tsx"
  - "src/components/**"
  - "src/app/globals.css"
---

# Design rules

Dark "scouting report" style, with a light theme picked on `/settings` (saved in localStorage, applied before paint by `src/lib/theme.ts`). Tokens live in `src/app/globals.css`, once for dark and once under `data-theme="light"`, so any new color needs both: **blue = you / ahead / win, red = opponent / behind / loss** (blue and red, never green and red, so color-blind players can tell them apart). Reuse the tokens (`bg-surface`, `text-muted`, `text-ahead`...) instead of raw colors. Views of both teams (scoreboards, Team analysis) color the winning team blue and the losing team red, with your row outlined; that includes the kill score and the build and runes picker. Where two numbers sit side by side, write the gap in words with `ui/gap.tsx` ("614 behind"). Cards use `ui/panel.tsx` (`Panel`, or `panelClass` for a list or paragraph); text sizes stick to Tailwind's plus `text-label`, `text-note` and `text-body`. Approved mockups: https://claude.ai/artifact/2yuQ2qLhDpjqX5SMLubpDr (only viewable from Jasper's account).

The accessibility scan in `e2e/accessibility.spec.ts` checks contrast in both themes on each Vercel preview and fails the smoke test on any finding. In light mode, text sits on the match list's tinted rows (`bg-ahead/10` on the page), so check a new light color there, not only on white.
