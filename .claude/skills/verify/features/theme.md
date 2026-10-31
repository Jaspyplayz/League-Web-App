# Theme

Dark or light, switched with the sun and moon button in the site header, on every page. The choice is saved in the browser and every page follows it. `/settings`, where the theme used to be picked, now sends you to home.

## Sub-features

- `theme-light` draws every page with the light colours.
- `theme-saved` keeps the choice across a reload, because a script in `<head>` applies it before the page is drawn.
- `theme-label` says what a click does: "Switch to light theme" in dark, "Switch to dark theme" in light. The icon shows the theme you're in: a moon in dark, a sun in light.

## How to get to it (user POV)

- The sun or moon button at the right of the header, next to Sign in or your picture. On a phone it's in the top row too, left of Sign in.

## Driving it with npm run shot

Preconditions: none. How it works needs no database or Riot key, so a worktree's dev server can show it.

- **Light mode anywhere.** `--light` saves "light" the way the switch does, before the page loads. `npm run shot -- --pr <n> --light /how-it-works` shows the light colours and the sun.
- **Any page in light mode.** Add `--light` to any other shot. The issue template asks for this on every visible change.

## Gotchas

- `--light` sets the saved choice directly. To prove that clicking the switch and reloading keeps it, use the "switch to light mode from the header" test in `e2e/smoke.spec.ts`.
- A browser that picked System on the old Settings page keeps following its device until the switch is pressed. `--light` doesn't show that case.
- The browser tab's icon follows the device's light or dark setting, not the site's theme, so a screenshot of the page never shows it.
- Blue means you, ahead or the winning team, and red means the opponent, in both themes. A light-mode screenshot is where a colour that breaks this shows up.
