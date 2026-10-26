# Home Riot ID lookup

A visitor types a Riot ID (`Name#TAG`) and picks a region on the home page, presses Analyze, and lands on that player's profile with the profile tabs showing.

## Sub-features

- `lookup-form` shows the `Player lookup` search form with `Riot ID`, `Region` (default `na`), and `Analyze`.
- `lookup-submit` goes to `/player/<region>/<Name>-<TAG>` for a valid Riot ID.
- `lookup-pending` changes the button to `Looking up…` while the profile loads.
- `lookup-profile` shows the player's name as the page heading and the `Profile sections` tabs.

## How to get to it (user POV)

- Open the home page `/` and use the form at the top.
- Choose the header link `Search for a player` (magnifier) on any page; it goes to `/#riotId`, the same form.
- Choose `Try a lookup Hide on bush#KR1` in the `Look at a game` section on the home page.

## Driving it with drive.ts

Preconditions:

- doctor reports `player profile [needs: riot] ok` on the target.
- Signed out, fresh context.

- **Open home.** Go to `/`. The level-1 heading contains `Find the minute` and the `search` landmark named `Player lookup` is visible.
- **Type the ID.** Fill the field labeled `Riot ID` with `Hide on bush#KR1` and pick `kr` in the select labeled `Region`. The field holds `Hide on bush#KR1`.
- **Submit.** Click the button `Analyze`. The URL becomes `/player/kr/Hide%20on%20bush-KR1`, the level-1 heading contains `Hide on bush`, and the navigation `Profile sections` is visible.
- **Run.** `npx tsx .claude/skills/verify-turnpoint/scripts/drive.ts [--base <url> | --pr <number>] home-lookup`.
- **Proof.** `03-press-analyze.png` shows the profile header and tabs. `03-press-analyze.aria.yml` holds the heading and `Profile sections` links.

## Gotchas

- Without a working Riot key the URL still changes but the profile shows "The site's Riot API key isn't working". The journey fails on that page, as it should.
- The region select defaults to `na`. Hide on bush is on `kr`; forgetting the region gives a "couldn't find" page, not a bug.
- `Looking up…` lasts under a second on a warm server. Don't try to screenshot it with a fixed sleep.
- The form validation path (no `#TAG`) is the UX skill's `ux-search-recovery`.
