---
paths:
  - "src/app/**/*.tsx"
  - "src/components/**"
  - "src/app/globals.css"
---

# Design rules

The look is the **Review board** ([0022](../../docs/adr/0022-the-review-board-look-arrives-by-expand-and-contract.md)). Pages move to it ticket by ticket: the old names below are aliases until the contract ticket (JAS-98) deletes them and turns on the lint checks, so every file you change uses only the new ones.

**Look.** Warm graphite, or warm light grey in the light theme, picked with the theme switch (on `/settings` until JAS-101 moves it into the header) and applied before paint by `src/lib/theme.ts`. Rubik only, sentence case, `tabular-nums` for numbers: no new `uppercase`, `tracking-wide*`, `font-mono` or `font-display`. Panels (`ui/panel.tsx`) have no border, one fill step off the page; the main button is `bg-main`.

**Colour.** Tokens are in `src/app/globals.css`, for dark and under `data-theme="light"`; a colour with no light value fails `src/app/themes.test.ts`. Old to new: `surface` → `panel`, `surface-hover` → `raised`, `line`/`line-strong` → `divider`, `ink`/`ink-soft` → `main`, `muted`/`faint` → `quiet`, `frame` → none. Also `select` (selected row, your row, hover) and `ahead-fill`/`behind-fill` for charts. **Blue = you / ahead / win, red = opponent / behind / loss**, and only for those, never green and red, so colour-blind players can tell them apart. Views of both teams colour the winner blue and the loser red. Write a gap in words with `ui/gap.tsx` ("614 behind"). No green (`npm run lint` flags green, emerald and lime), and no hex or `rgb()` in `.ts`/`.tsx` except the match page's `opengraph-image.tsx` (it can't read CSS variables), `src/components/icons.tsx` (brand logos) and `src/components/rank-tints.ts`, the ten rank badge tints JAS-116 creates, whose emerald mint is the one approved green.

**Grades.** Eleven `grade-*` colours, each on a circle with its own symbol. Several light ones fail 4.5:1 as text (0022), so check before using one on text.

**Type.** Title 28px, headings 17 to 19px, body `text-body` (15px), small `text-note` (13px). `text-label` leaves with the all-caps labels.

**Corners.** `rounded-md` (6px: panels, buttons, inputs, portraits), `rounded-sm` (4px: eval bar, small chips), `rounded-full` (grade marks, controls already pills). Not `soft-round`, plain `rounded`, `rounded-lg` or bigger, made-up sizes, or clipped or beveled corners; JAS-98's corners test fails on each.

**Spacing and motion.** 40px page sides, 68px header, 24 to 28px between columns, 14px between panels. Hover fades in 0.12s and out 0.32s, never during a theme switch or under reduced motion (`globals.css` keeps one 150ms fade until a ticket moves it).

**Process.** The ticket links its mockup before work starts; no link, ask Jasper. Before Done, the PR puts screenshots beside the mockup in dark, light and at 390px, naming each intended difference. Jasper merges the look's foundations: `globals.css`, `themes.test.ts` and these rules are on `scripts/risky-paths.ts` (the corners test joins in JAS-98). A restyle using only the tokens stays normal tier.

**Accessibility.** `e2e/accessibility.spec.ts` scans each Vercel preview and fails on any finding. Light text is hardest to read on blue and red tints over the page, so check a new light colour there: `ahead` and `behind` pass on `/10`, use `ahead-soft` or `ahead-bright` on `/15`, and only `ahead-bright` on `/20`.

**Approved mockups.** [JAS-72](https://linear.app/jaspy/issue/JAS-72) in Linear: its Decisions so far lists each page's ticket, which links its canvas or prototype. Claude reads Linear anywhere but can't open claude.ai canvases.
