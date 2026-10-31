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
- Some controls that relied on the outline alone, such as the header's search and settings buttons, now show only their icon until the header ticket redraws them.
- JAS-94's light blue (`#1c66d6`) and red (`#cb2c2c`) are about 4.0:1 against the 10% blue and red tints over the light page, under WCAG AA's 4.5:1; the old values were tuned to clear it. The accessibility scan on the preview says whether any page puts those colours there; if it does, the fix is Jasper's call, since it changes an approved value.
- `@theme static` writes out every token, about 40 short lines of CSS that no class uses yet.
- The contract ticket deletes the aliases, the Soft Rounded utilities, Barlow Condensed and IBM Plex Mono, and the "Review board tokens" half of `themes.test.ts`. A revert of this PR puts the old look back completely.
