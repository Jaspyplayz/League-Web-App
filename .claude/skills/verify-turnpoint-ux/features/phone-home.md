# Home on a phone

On a phone the home page fits the screen: no sideways scrolling, the Analyze button is fully on screen and big enough to tap, and the `Look at a game` start cards are reachable by scrolling.

## Sub-features

- `phone-fit` keeps `scrollWidth` within `clientWidth` (no sideways scroll).
- `phone-tap` keeps `Analyze` inside the screen and at least 44 px tall.
- `phone-cards` shows the `Look at a game` region with `See a sample analysis` after scrolling.

## How to get to it (user POV)

- Open `/` on a phone.

## Driving it with drive.ts

Preconditions:

- doctor reports `home page ok`. No keys needed.
- Playwright device `Pixel 7` (412×915 CSS px, touch), signed out.

- **Open home.** Go to `/`. The level-1 heading contains `Find the minute` (case-insensitive) and the page is calm.
- **Fit.** `document.documentElement.scrollWidth` ≤ `clientWidth` + 1 (saved as `notes.scrollWidth` and `notes.clientWidth`). The `Analyze` button's box lies inside the width and is ≥ 44 px tall.
- **Cards.** Scroll the region `Look at a game` into view. Link `See a sample analysis` is visible.
- **Run.** `npx tsx .claude/skills/verify-turnpoint-ux/scripts/drive.ts [--base <url> | --pr <number>] ux-phone-home`.
- **Proof.** `01-open-home-on-a-phone.png` (top of the page) and `03-scroll-to-the-start-cards.png`.

## Gotchas

- Only Pixel 7 is covered. Narrower phones (320 px) are not.
- The 44 px tap target is a guideline check (WCAG 2.5.5 / Apple HIG), not a spec from the repo.
