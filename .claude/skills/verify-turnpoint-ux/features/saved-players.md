# Saved players box

Clicking or typing in either search, home's or the header's, opens a box under it with this browser's saved players: Recent and Pinned tabs with counts, and a row for each player with a rank badge, name and tag, region, a star and an ×. The ranks come from the database through `POST /api/saved-players`, so the site spends no Riot calls on them.

## Sub-features

- `box-open` opens on a click or on typing, and never when nothing is saved and nobody is signed in.
- `box-close` closes on Escape, with the cursor back in the search, and on a click outside.
- `box-filter` narrows the rows to what's typed.
- `box-pin` stars a player onto Pinned; `box-remove` takes them off the open tab's list only.
- `box-badge` shows a short tag ("D1", "GM", "C") on the tier's tint, or a dash for no rank on file.
- `box-phone` fits 390px with no sideways scroll and 44px buttons.

## How to get to it (user POV)

- Search a player so they land in Recent, or star one on their profile.
- Click the Riot ID box on home, or in the header on any other page.

## Driving it with drive.ts

`ux-saved-players` and `ux-saved-players-phone` fill the lists in localStorage directly, so they need no keys. Without a database every row shows a dash. On a preview the sample player can show a real badge, saved as `notes.sampleBadge`.

`ux-saved-players`:

- **First visit.** On `/` with nothing saved, click and type in `Riot ID`. No `Recent` tab appears.
- **Open.** Save two recent players and one pinned, reload, click `Riot ID`. The tabs read `Recent 2` and `Pinned 1`.
- **Filter.** Type `never`. The Recent panel has one row. Clear it, and it has two.
- **Pin and remove.** Press `Pin Never Looked Up#0000` and go to Pinned, which now reads 2. Press `Remove Never Looked Up#0000 from pinned players`. Pinned reads 1 and Recent still reads 2.
- **Close.** Escape hides the box and `Riot ID` keeps focus. Click it again to reopen, then click the page heading to close.
- **Reload.** The counts are the same after a reload.
- **Header.** On `/how-it-works`, the header's `Riot ID` opens the same box, and a row links to that player's page.

`ux-saved-players-phone`: at 390px wide, `scrollWidth` stays within `clientWidth`, and the star and × are on screen and at least 44px tall, then the same in light mode.

`ux-saved-players-search` needs the Riot key: search the test player, then click the header's `Riot ID`. The Recent panel has them, with their badge saved as `notes.badge`.

- **Run.** `npx tsx .claude/skills/verify-turnpoint-ux/scripts/drive.ts [--base <url> | --pr <number>] ux-saved-players ux-saved-players-phone ux-saved-players-search`.
- **Proof.** Each step's screenshot.

## Gotchas

- The signed-in player's own "You" row needs a real sign-in, and previews have none. Its unit tests are in `saved-players-box.test.tsx` and `api/saved-players/route.test.ts`.
- Which tier tints show depends on who is in the database. `rank-badge.test.tsx` covers all ten.
- Hover is not a phone thing, so the full rank in a badge's `title` only shows with a mouse.
