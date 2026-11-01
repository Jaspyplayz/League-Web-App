---
paths:
  - "src/app/**/*.tsx"
  - "src/components/**"
  - "src/app/globals.css"
---

# Design rules

The look is the **Review board** ([0022](../../docs/adr/0022-the-review-board-look-arrives-by-expand-and-contract.md)). Every page is on it, and the checks named below keep the old look out.

**Look.** Warm graphite, or warm light grey in the light theme (applied before paint by `src/lib/theme.ts`). Rubik only, sentence case, `tabular-nums` for numbers: `uppercase`, `tracking-wide*`, `font-mono`, `font-display` and any other font fail lint (`turnpoint/review-board-type`). Cards use `ui/panel.tsx` (`Panel`, or `panelClass` for a list or paragraph): no border, one fill step off the page. The main button is `bg-main`. A link in a sentence is `linkClass` from `ui/state-panel.tsx`: the text colour, underlined, since blue only means you.

**Colour.** Only the tokens in `src/app/globals.css`; Tailwind's palette fails lint (`turnpoint/tokens-only`), and a colour with no light value fails `themes.test.ts`. `panel` is a card, `raised` a fill inside a panel, `select` a hover or selected row, `divider` a line, `main` text and `quiet` quieter text. A row with red text in it takes `raised` when selected, because that red is too faint to read on `select` in the dark theme (Game review's plays). The old colour names fail lint (`turnpoint/tokens-only`), since a class with no token draws nothing. **Blue = you / ahead / win, red = opponent / behind / loss**, never green and red, so colour-blind players can tell them apart. Views of both teams (scoreboards, Team analysis, the kill score, the build and runes picker) colour the winner blue and the loser red, with your row outlined. Write a gap in words with `ui/gap.tsx` ("614 behind"). Hex and `rgb()` in `.ts`/`.tsx` fail lint (`turnpoint/tokens-only`), except in the match page's `opengraph-image.tsx`, `src/components/icons.tsx` (brand logos), `src/components/rank-tints.ts` (the rank badge tints) and tests. The Emerald badge's mint, a hex in `rank-tints.ts`, is the one approved green.

**Grades.** Eleven `grade-*` colours, each on a circle with its own symbol. Several light ones fail 4.5:1 as text (0022), so check before using one on text.

**Type.** A page's title is `text-title` (28px), a section heading `text-heading` (19px) and a panel heading `text-subheading` (17px); `ui/section-heading.tsx` and `ui/panel-heading.tsx` use them. Other text is `text-body` (15px), `text-note` (13px) or a Tailwind size. `text-[Npx]` fails lint (`turnpoint/review-board-type`).

**Corners.** `rounded-md` (6px: panels, buttons, inputs, portraits), `rounded-sm` (4px: eval bar, small chips), `rounded-full` (grade marks, controls already pills), and their one-side forms where an open row meets its panel. Data marks under about 24px take `rounded-sm` or none. `src/app/corners.test.ts` fails on anything else: `soft-round*`, plain `rounded`, `rounded-lg` or bigger, made-up sizes, a border radius in CSS, a class or a style, and beveled corners. The share image writes its 6px out, because it has no stylesheet.

**Spacing and motion.** 40px page sides, 68px header, 24 to 28px between columns, 14px between panels. Hover fades in 0.12s and out 0.32s, never during a theme switch or under reduced motion.

**Process.** The ticket links its mockup before work starts; no link, ask Jasper. Before Done, the PR puts screenshots side by side with the mockup, in dark, light and at 390px wide (`npm run shot -- --phone`), naming each intended difference. Jasper merges the look's checks and rules (`themes.test.ts`, `corners.test.ts`, `eslint-rules/`, these rules), which are on his list in `scripts/risky-paths.ts`. `globals.css` is on the panel list, so a change to it gets the interrogate panel, and Claude merges it after ([0025](../../docs/adr/0025-risky-prs-merge-after-the-panel.md)). A restyle that touches none of them stays normal tier.

**Accessibility.** `e2e/accessibility.spec.ts` scans each Vercel preview and fails on any finding. Text is hardest to read on the blue and red tints, so check a new colour on them in both themes, over `page`, `panel` and `raised`, not only on white. Over the light page, `ahead` and `behind` pass on `/10`; on `/15` use `ahead-soft` or `ahead-bright`, on `/20` only `ahead-bright`, and keep red text off `/15` and `/20`. In dark, `/10` over `raised` fails for both.

**Approved mockups.** [JAS-72](https://linear.app/jaspy/issue/JAS-72) in Linear: its Decisions so far lists each page's ticket, which links its canvas or prototype.
