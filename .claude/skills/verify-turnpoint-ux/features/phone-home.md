# Home on a phone

On a phone the home page fits the screen: no sideways scrolling, the Search button is fully on screen and big enough to tap, and the example game's `Open this game` is reachable by scrolling.

## Sub-features

- `phone-fit` keeps `scrollWidth` within `clientWidth` (no sideways scroll).
- `phone-tap` keeps `Search` inside the screen and at least 44 px tall.
- `phone-example` shows the example game's `Open this game` link after scrolling.

## How to get to it (user POV)

- Open `/` on a phone.

## Driving it with drive.ts

Preconditions:

- doctor reports `home page ok`. No keys needed.
- Playwright device `Pixel 7` (touch), narrowed to 390×844 CSS px, the width the design rules check, signed out.

- **Open home.** At 390px wide, go to `/`. The level-1 heading is `Turnpoint` and the page is calm.
- **Fit.** `document.documentElement.scrollWidth` ≤ `clientWidth` + 1 (saved as `notes.scrollWidth` and `notes.clientWidth`). The `Search` button's box lies inside the width and is ≥ 44 px tall.
- **Example.** Scroll the link `Open this game` (exact name) into view. It is visible.
- **Run.** `npx tsx .claude/skills/verify-turnpoint-ux/scripts/drive.ts [--base <url> | --pr <number>] ux-phone-home`.
- **Proof.** `01-open-home-at-390px.png` (top of the page) and `03-scroll-to-the-example-game.png`.

## Gotchas

- Only 390 px wide is covered. Pixel 7 on its own is 412 px, so the journey narrows it first; without that, an element 391 to 412 px wide would pass here and still scroll sideways on a 390 px iPhone. Narrower phones (320 px) are not covered.
- The 44 px tap target is a guideline check (WCAG 2.5.5 / Apple HIG), not a spec from the repo.
