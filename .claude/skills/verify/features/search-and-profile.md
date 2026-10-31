# Search and profile

A player types a Riot ID on the home page, picks a region and lands on that player's profile: rank cards, recent matches, and the sections Champions, Insights, Log and Ask.

## Sub-features

- `search` sends the Riot ID and region to the profile's URL.
- `profile` shows the player summary, rank cards and recent matches.
- `profile-sections` switches between Matches, Champions, Insights, Log and Ask.
- `not-found` sends a bad link to the 404 page, which has its own search box.

## How to get to it (user POV)

- The home page form: the `Riot ID` field, the `Region` select and the `Search` button.
- The search button in the site header, on every page.
- A pasted link such as `/player/kr/Hide%20on%20bush-KR1`.
- The `Profile sections` links under the player's name.

## Driving it with npm run shot

Preconditions: `npm run shot -- --check` exits 0, and its profile line says `ok`, not `riot-key`.

- **Home page.** `npm run shot -- --pr <n> /` shows the "Turnpoint" logo heading, the search form and the example game.
- **Profile.** `npm run shot -- --pr <n> "/player/kr/Hide%20on%20bush-KR1"` shows the region named `Player summary`, the `Ranked Solo/Duo` card and `Recent matches`. Searching lands on this URL, so shoot it directly.
- **Sections.** Add `/champions`, `/insights`, `/log` or `/ask` to the profile path.
- **Not found.** `npm run shot -- --pr <n> --expect not-found /this-page-does-not-exist` saves the 404 page. Without `--expect` it reports `not-found` and exits 1, and so does a player or match link with a typo, even though those pages answer 200.

## Gotchas

- The `#` in a Riot ID becomes `-` in the URL, and spaces become `%20`.
- A profile that loaded can still be empty. On 2026-10-24 Hide on bush's profile shows "No recent games found" because saved games still hold the old Riot key's player ids (#154). Look at the screenshot before calling it proof, and until #154 is fixed, use a player first looked up after that date.
- The match rows' tabs (`Overview`, `Team analysis`, `Build`, `Runes`) appear only after a row is opened, so `--tab` can't reach them from the profile.
- Every profile visit spends Riot requests. Shoot the pages you need, not every section.
