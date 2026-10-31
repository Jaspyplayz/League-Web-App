# Match Summary 60-second review

Opening a game lands on its Summary tab, which leads with a `60-second review`: one to three moments from the game, each with something to think about and buttons to watch it in the replay or add it to notes.

## Sub-features

- `match-summary` opens with the `Summary` tab selected in the `Match analysis` tablist and the result (`Victory`/`Defeat`) in the `Match summary` region.
- `review-moments` lists 1–3 moments in the `60-second review` region.
- `review-prompt` gives each moment a `Think about` line.
- `review-actions` gives each moment `Watch in replay` and `Add to notes` buttons. Clicking them is the UX skill's `ux-review-path`.

## How to get to it (user POV)

- Choose `Open this game` on the home page.
- Choose a row in a profile's `Recent matches` list.
- Open a pasted match link such as `/player/kr/Hide%20on%20bush-KR1/match/KR_8416261221`.

## Driving it with drive.ts

Preconditions:

- doctor reports `sample game [needs: database] ok`. No Riot key needed: the sample game is stored.
- Signed out, fresh context.

- **Open the game.** Go to `/player/kr/Hide%20on%20bush-KR1/match/KR_8416261221`. Tab `Summary` has `aria-selected="true"` and `Victory` is visible.
- **Review moments.** Scroll the region `60-second review` into view. It holds 1–3 `listitem`s (3 on live, 2026-10-25; saved as `notes.moments`), the text `Think about`, and a `Watch in replay` button.
- **Run.** `npx tsx .claude/skills/verify-turnpoint/scripts/drive.ts [--base <url> | --pr <number>] match-review`.
- **Proof.** `02-60-second-review-has-moments.png` shows the review card with its moments; the `.aria.yml` lists them.

## Gotchas

- `Victory` also appears in other sections. Assert it on the summary and the tab state, not on a count.
- The review only shows moments the analysis found. Other games can show fewer than 3; 0 or more than 3 is a failure.
- The `Deep dive` tab content is in the page but hidden. Check `aria-selected` and visibility, not presence.
