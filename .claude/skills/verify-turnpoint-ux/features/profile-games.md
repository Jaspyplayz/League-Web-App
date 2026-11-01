# Profile games

A player's profile has three tabs, Matches, Champions and Insights. Matches shows the games as a List or By day (the old Log tab), switched beside the queue choices. Each game row is one link to that game's match page, and the old Log address lands on By day.

## Sub-features

- `profile-tabs` shows one bar of three links, `Matches`, `Champions`, `Insights`, with `Matches` current on the profile.
- `profile-by-day` switches to By day from the `Matches view` switch: the URL gains `?view=day`, `By day` is current, and the `Days` heading (or the four-weeks empty panel) shows.
- `profile-list` switches back to `List`, with no query in the URL and `Recent matches` showing.
- `profile-row` opens a game's match page from anywhere on its row (the journey clicks its items), with `Summary` selected.
- `profile-old-log` sends `/log` to the profile's By day view.

## How to get to it (user POV)

- Search a Riot ID on home or in the header, landing on the profile's Matches tab.
- Choose `List` or `By day` beside the queue choices.
- Click anywhere on a game row.
- Open an old `/player/<region>/<Name-TAG>/log` link.

## Driving it with drive.ts

Preconditions:

- doctor reports `player profile [needs: riot] ok`.
- Signed out, fresh context, reduced motion.

- **Profile.** Go to `/player/kr/Hide%20on%20bush-KR1`. Heading `Recent matches` visible, calm. Navigation `Profile sections` has exactly the links `Matches`, `Champions`, `Insights`; `Matches` and, in navigation `Matches view`, `List` have `aria-current="page"`.
- **By day.** Click `By day` in `Matches view`. The URL ends `?view=day`, `By day` is current, and heading `Days` or the text `No games in the last …` is visible (saved as `notes.byDay`). `Matches` is still the current tab. Calm.
- **List.** Click `List`. Heading `Recent matches` visible and the URL has no query.
- **Row.** Note the first link named `Open this <champion> game (…)` (saved as `notes.row`), then mouse-click the middle of the first row's game score box (labelled `Game score N out of 100`, or `No game score`). The URL contains `/match/KR_` and tab `Summary` has `aria-selected="true"`. Calm.
- **Old Log address.** Go to `/player/kr/Hide%20on%20bush-KR1/log`. The page lands on `/player/kr/Hide%20on%20bush-KR1?view=day` with `By day` current. Calm.
- **Run.** `npx tsx .claude/skills/verify-turnpoint-ux/scripts/drive.ts [--base <url> | --pr <number>] ux-profile-games`.
- **Proof.** `01-open-the-profile.png`, `02-switch-to-by-day.png`, `04-click-a-game-row-and-land-on-its-match-page.png`, `05-old-log-address-lands-on-by-day.png`, with the ARIA snapshots showing which tab and view are current.

## Gotchas

- The profile needs a working Riot key. The Riot-key notice is a FAIL with that reason; use the live site or a preview.
- By day draws its days in the browser (they depend on the viewer's timezone), so the `Days` heading appears a moment after the page.
- A player with no games in the last four weeks gets the empty panel instead of `Days`. Both pass; the note says which.
- Each row's player names are links to their own profiles. Click the row away from a name.
- Playwright's `locator.click()` on the items refuses, because the row link's cover is on top of them by design. Click the spot with `page.mouse` instead.
