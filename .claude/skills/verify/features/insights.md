# Insights

Trends across a player's recent games, in three views: Overview, You vs others, and Habits and sessions.

## Sub-features

- `overview` is the player's own trends.
- `others` compares the player's games with a rank's or another player's.
- `habits` shows habits (level 6 first, first scuttles, early ganks, first back), session blocks and death recaps.
- `not-enough-games` is the notice shown when fewer than 3 recent Summoner's Rift games lasted 15 minutes.

## How to get to it (user POV)

- `Insights` in the profile's `Profile sections` links, then the view links under the filter bar.

## Driving it with npm run shot

Preconditions: `npm run shot -- --check` exits 0, and the player has at least 3 recent Summoner's Rift games of 15 minutes or more.

- **Each view.** The views are links that set `?view=`, so shoot them as paths: `".../insights?view=overview"`, `".../insights?view=others"`, `".../insights?view=habits"`, after `/player/<region>/<riot id>`.
- **Proof.** The screenshot shows the view's sections. If it shows "Not enough games to spot trends yet", it proves only that notice.

## Gotchas

- On 2026-10-24 every view for Hide on bush shows "Not enough games to spot trends yet" (the saved games problem in #154). Use a player first looked up after that date until #154 is fixed.
- Pick a player who plays ranked on Summoner's Rift. ARAM, Arena and remakes don't count.
