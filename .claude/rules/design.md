---
paths:
  - "src/app/**/*.tsx"
  - "src/components/**"
  - "src/app/globals.css"
---

# Design rules

Dark "scouting report" style, with a light theme picked on `/settings` (saved in localStorage, applied before paint by `src/lib/theme.ts`). Tokens live in `src/app/globals.css`, once for dark and once under `data-theme="light"`, so any new color needs both: **blue = you / ahead / win, red = opponent / behind / loss** (blue and red, never green and red, so color-blind players can tell them apart; `npm run lint` flags green, emerald and lime classes). Reuse the tokens (`bg-surface`, `text-muted`, `text-ahead`...) instead of raw colors. Views of both teams (scoreboards, Team analysis) color the winning team blue and the losing team red, with your row outlined; that includes the kill score and the build and runes picker. Where two numbers sit side by side, write the gap in words with `ui/gap.tsx` ("614 behind"). Cards use `ui/panel.tsx` (`Panel`, or `panelClass` for a list or paragraph); text sizes stick to Tailwind's plus `text-label`, `text-note` and `text-body`. Corners are Soft Rounded: cards, menus and tall primary buttons use `soft-round` (6px), and icon buttons, portraits and shorter controls use `soft-round-sm` (4px), both tokens in `globals.css`. Do not add clipped or beveled corners. A full pill (`rounded-full`) is only for a control that is already a pill, such as the queue filters. The playbook is `.claude/skills/soft-rounded-ux/SKILL.md`. Approved mockups: https://claude.ai/artifact/2yuQ2qLhDpjqX5SMLubpDr (only viewable from Jasper's account).

The accessibility scan in `e2e/accessibility.spec.ts` checks the pages it visits on each Vercel preview and fails the smoke test on any finding. Light mode is darkest under text on the blue and red tints over the page (`bg-ahead/10` match rows, `/15` and `/20` pills and hovers), so check a new light color there, not only on white. On `/15` use `text-ahead-soft` or `text-ahead-bright`; on `/20` over the page only `text-ahead-bright` passes (`text-ahead-soft` is 4.42:1 there).
