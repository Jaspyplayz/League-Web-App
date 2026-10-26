# Profile match list

A player's profile shows their ranked card and a `Recent matches` list of their latest games, each row marked Victory or Defeat, with queue links to filter the list.

## Sub-features

- `profile-rank` shows the `Ranked Solo/Duo` card.
- `profile-list` shows the `Recent matches` region with at least one Victory/Defeat row.
- `profile-queue` filters the list by queue (`All`, `All ranked`, `Ranked Solo/Duo`, …) and puts `queue=` in the URL.
- `profile-tabs` marks `Matches` as the current tab in `Profile sections`.

## How to get to it (user POV)

- Look up a player from the home page (see [home-lookup](./home-lookup.md)).
- Open a pasted profile link such as `/player/kr/Hide%20on%20bush-KR1`.
- Choose `Matches` in the `Profile sections` tabs from any other profile tab.

## Driving it with drive.ts

Preconditions:

- doctor reports `player profile [needs: riot] ok` and `sample game [needs: database] ok`.
- Signed out, fresh context.

- **Open profile.** Go to `/player/kr/Hide%20on%20bush-KR1` (pasted link). Headings `Recent matches` and `Ranked Solo/Duo` are visible.
- **Rows.** Inside the region `Recent matches`, count text `Victory` / `Defeat` / `Remake`. At least 1 (10 on live, 2026-10-25). The count is saved as `notes.resultLabels`.
- **Filter.** Inside `Recent matches`, click the link `Ranked Solo/Duo` (exact). The URL gains `queue=` and the `Recent matches` heading is still there.
- **Run.** `npx tsx .claude/skills/verify-turnpoint/scripts/drive.ts [--base <url> | --pr <number>] profile-matches`.
- **Proof.** `02-match-list-has-rows.png` and `.aria.yml` show the rows; `03-…png` shows the filtered list.

## Gotchas

- Result labels are uppercase on screen (`VICTORY`) through CSS; the matcher is case-insensitive.
- The queue link text `Ranked Solo/Duo` also names the rank card heading. Scope the click to the `Recent matches` region and use `exact`.
- A brand-new or inactive player can have zero rows. That is a data gap, not a list bug; use the test player.
- The old note in `.claude/skills/verify` that issue #154 empties this player's list did not hold on live on 2026-10-25.
