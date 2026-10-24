# Settings

The theme choice: Dark ("The original look"), Light ("White background") or System ("Follows your device"). It is saved in the browser and every page follows it.

## Sub-features

- `theme-light` draws every page with the light colours.
- `theme-saved` keeps the choice across a reload, because a script in `<head>` applies it before the page is drawn.

## How to get to it (user POV)

- The gear button in the site header, or `/settings`.

## Driving it with npm run shot

Preconditions: none. The page needs no database or Riot key, so a worktree's dev server can show it.

- **Light mode anywhere.** `--light` saves "light" the way the Settings page does, before the page loads. `npm run shot -- --pr <n> --light /settings` shows `Light` selected and the light colours.
- **Any page in light mode.** Add `--light` to any other shot. The issue template asks for this on every visible change.

## Gotchas

- `--light` sets the saved choice directly. To prove that clicking `Light` and reloading keeps it, use the "switch to light mode in Settings" test in `e2e/smoke.spec.ts`.
- Blue means you, ahead or the winning team, and red means the opponent, in both themes. A light-mode screenshot is where a colour that breaks this shows up.
