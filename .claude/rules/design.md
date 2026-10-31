---
paths:
  - "src/app/**/*.tsx"
  - "src/components/**"
  - "src/app/globals.css"
---

# Design rules

The look is the **Review board** ([0022](../../docs/adr/0022-the-review-board-look-arrives-by-expand-and-contract.md)). Pages move to it ticket by ticket; the old names below are aliases until the contract ticket (JAS-98) deletes them and turns on the lint checks. New code and every file a ticket restyles use only the new names; a small fix elsewhere can keep the old ones.

**Look.** Warm graphite, or warm light grey in the light theme (applied before paint by `src/lib/theme.ts`). Rubik, sentence case, `tabular-nums` for numbers: no new `uppercase`, `tracking-wide*`, `font-mono` or `font-display`. Cards use `ui/panel.tsx` (`Panel`, or `panelClass` for a list or paragraph): no border, one fill step off the page. The main button is `bg-main`.

**Colour.** Only the tokens in `src/app/globals.css`, never Tailwind's palette; a colour with no light value fails `themes.test.ts`. Old to new: `surface` → `panel`; `surface-hover` → `select` for a hover or selected row, `raised` for a fill inside a panel; `line`/`line-strong` → `divider`; `ink`/`ink-soft` → `main` (so an `ink-soft` to `ink` hover shows nothing: use `select`); `muted`/`faint` → `quiet`; `frame` → none. **Blue = you / ahead / win, red = opponent / behind / loss**, never green and red, so colour-blind players can tell them apart. Views of both teams (scoreboards, Team analysis, the kill score, the build and runes picker) colour the winner blue and the loser red, with your row outlined. Write a gap in words with `ui/gap.tsx` ("614 behind"). No hex or `rgb()` in `.ts`/`.tsx` except the match page's `opengraph-image.tsx`, `src/components/icons.tsx` (brand logos) and `src/components/rank-tints.ts`, the rank badge tints JAS-116 creates. The Emerald badge's mint, a hex in `rank-tints.ts`, is the one approved green.

**Grades.** Eleven `grade-*` colours, each on a circle with its own symbol. Several light ones fail 4.5:1 as text (0022), so check before using one on text.

**Type.** A page's title is `text-title` (28px), a section heading `text-heading` (19px) and a panel heading `text-subheading` (17px); JAS-102 moves `ui/section-heading.tsx` and `ui/panel-heading.tsx` to them. Other text is `text-body` (15px), `text-note` (13px) or a Tailwind size, never `text-[Npx]`. `text-label` leaves with the all-caps labels.

**Corners.** `rounded-md` (6px: panels, buttons, inputs, portraits), `rounded-sm` (4px: eval bar, small chips), `rounded-full` (grade marks, controls already pills), and their one-side forms where an open row meets its panel. Data marks under about 24px take `rounded-sm` or none. Never `soft-round*`, `rounded-*-soft`, plain `rounded`, `rounded-lg` or bigger, made-up sizes, or beveled corners.

**Spacing and motion.** 40px page sides, 68px header, 24 to 28px between columns, 14px between panels. Hover fades in 0.12s and out 0.32s, never during a theme switch or under reduced motion.

**Process.** The ticket links its mockup before work starts; no link, ask Jasper. Before Done, the PR puts screenshots side by side with the mockup, in dark, light and at 390px wide (`npm run shot -- --phone`), naming each intended difference. Jasper merges the look's foundations, the files on `scripts/risky-paths.ts` (`globals.css`, `themes.test.ts`, these rules); a restyle that touches none of them stays normal tier.

**Accessibility.** `e2e/accessibility.spec.ts` scans each Vercel preview and fails on any finding. Text is hardest to read on the blue and red tints, so check a new colour on them in both themes, over `page`, `panel` and `raised`, not only on white. Over the light page, `ahead` and `behind` pass on `/10`; on `/15` use `ahead-soft` or `ahead-bright`, on `/20` only `ahead-bright`, and keep red text off `/15` and `/20`. In dark, `/10` over `raised` fails for both.

**Approved mockups.** [JAS-72](https://linear.app/jaspy/issue/JAS-72) in Linear: its Decisions so far lists each page's ticket, which links its canvas or prototype.
