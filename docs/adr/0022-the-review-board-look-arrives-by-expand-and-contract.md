# 0022: The Review board look arrives by expand and contract

Status: draft (JAS-97, the expand step of JAS-96). Jasper accepts it by merging the PR.

## Context

Jasper approved the "Review board" look (JAS-77) and its token names (JAS-94): warm graphite and warm light grey, Rubik, 6px corners and borderless panels, with new names such as `panel`, `main` and `quiet` in place of `surface`, `ink` and `muted`. The old colour names are used about 1,000 times across roughly 100 files, and the Soft Rounded corner classes in 54. No one page's PR can rename all of them and keep every other page looking right.

Tailwind 4 also leaves a theme variable out of the built CSS when no class uses it. The new tokens no page uses yet (`select`, `ahead-fill`, `behind-fill` and the eleven `grade-*`) would reach the light theme, which is plain CSS, but not the dark one.

## Options

1. Rename every use in one PR. Thousands of changed lines across most of the site, hard to review, and it collides with every other open branch.
2. Expand and contract. One PR adds the new tokens beside the old ones and points each old name at its new token; page tickets move their own files to the new names; a last PR deletes the old names.
3. Expand by copying values: give each old name the new hex value instead of pointing it at the new token. Works, but each colour is then written twice per theme, and the two copies can drift apart.

## Decision

Option 2, with each old name pointed at its new token by `var()`:

- `--color-surface: var(--color-panel)`, and the same for `surface-hover`, `line`, `line-strong`, `ink`, `ink-soft`, `muted` and `faint`, as JAS-96's table says. An alias sits only in `@theme`, so it follows its token into the light theme by itself.
- `--color-frame` is `transparent` in both themes. Panels lose their outline without any page changing, and since a border's area is painted with the panel's own fill, nothing shifts by a pixel.
- `--radius-soft` and `--radius-soft-sm` become 6px and 4px, so `soft-round` and `soft-round-sm` render at the new sizes until pages move to `rounded-md` and `rounded-sm`.
- Rubik replaces IBM Plex Sans as the body font. Plex Sans fed only `font-sans`, so keeping it would download a font nothing shows. Barlow Condensed and IBM Plex Mono stay for the headings and labels that still use them.
- `@theme` becomes `@theme static`, so every token is written out in both themes whether or not a class uses it yet.
- `src/app/themes.test.ts` fails when a colour has a dark value and no light one (an alias, `rift-ground` and `rift-wall` excepted). It and `globals.css` join the risky list, so Jasper merges changes to the palette.

## Consequences

- The live site takes the new look on every page as soon as this merges, before any page is rebuilt. Pages still show all-caps labels, the condensed headings and the old layouts until their own tickets.
- `frame` was also used outside panels, and each of those loses its outline until its page's ticket: the header's search and settings buttons show only their icon; the account menu and the saved-players menu (`border-frame` over `bg-surface`) no longer stand out from a panel behind them; the region chip in the saved-players menu becomes plain text; the champions page's "Load more games" button and the level badge on the profile icon lose their outlines; and the profile icon and mastery portraits keep a 1 to 2px empty gutter where the ring was. The one non-border use, the mastery crest's outline (`text-frame`), would have vanished, so it moves to `text-quiet` here.
- Folding old shades into one new token drops a step wherever a page used two: `ink-soft` and `ink` are both `main`, so `text-ink-soft hover:text-ink` no longer changes on hover; `muted` and `faint` are both `quiet`; and the gold chart's zero line (`line-strong`) and grid lines (`line`) are the same colour, told apart only by their dashes. JAS-96's table chose these folds; the page tickets restore any step they need with the new tokens.
- Two approved values miss WCAG AA's 4.5:1 for text where pages already use them, and the accessibility scan on this PR's preview fails on both:
  - Light `ahead` (#1c66d6) and `behind` (#cb2c2c) on the 10% blue and red tints over the page reach about 4.0:1 (the old values cleared it at 4.7). The profile's win and loss rows put the result and other text there: 10 elements in light mode.
  - Dark `behind` (#ff6a63) on `raised` (#353330) is 4.49:1. The replay's win-chance number on the Deep dive tab sits there.
  The smallest same-hue changes that pass are light `ahead` #105dcc, light `behind` #bf1c21 and dark `behind` #ff6d65. The other way is to keep the values and change those uses (`text-ahead-soft` reaches 5.2:1 on the blue tint, but red has no softer token yet). Jasper chose the nudge on 2026-10-31, so this PR ships those three values (and the fills made from them). They reach 4.58:1, 4.58:1 and 4.57:1 on the same backgrounds. The light grade colours keep JAS-77's values for now, because no page uses a `grade-*` token yet. They aren't safe as text, though: `grade-great` and `grade-blunder` reach only about 4.0:1 on the same 10% tints, and on white several light grades are under 4.5:1 (brilliant 4.03, book 3.85, even 3.67, mistake 3.16, best 2.49, inaccuracy 1.75). The replay ticket that first uses them has to check them.
- Placeholder text drops from 3.9:1 to 3.3:1 in dark (on a panel) and is 3.0:1 in light on white. Placeholder text isn't held to 4.5:1 by the scan, so nothing fails, but it's fainter than before.
- `@theme static` writes out every token, about 40 short lines of CSS that no class uses yet.
- The contract ticket deletes the aliases, the Soft Rounded utilities, Barlow Condensed and IBM Plex Mono, and the "Review board tokens" half of `themes.test.ts`. A revert of this PR puts the old look back completely.
