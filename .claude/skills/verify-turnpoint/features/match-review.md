# Match Summary 60-second review

Opening a game lands on its Summary tab, whose `Game review` column marks the `60-second review`: one to three moments from the game, each with something to think about and buttons to watch it in the replay or add it to notes.

## Sub-features

- `match-summary` opens with the `Summary` tab selected in the `Match analysis` tablist and the result (`Victory`/`Defeat`) in the `Match summary` region.
- `review-moments` marks 1–3 plays in the `Game review` region as `In your 60-second review`.
- `review-prompt` gives a moment a `Think about` line when it's the opened play.
- `review-actions` gives an opened moment `Watch in replay` and `Add to notes` buttons. Clicking them is the UX skill's `ux-review-path`.

## How to get to it (user POV)

- Choose `Open this game` on the home page.
- Choose a row in a profile's `Recent matches` list.
- Open a pasted match link such as `/player/kr/Hide%20on%20bush-KR1/match/KR_8416261221`.

## Driving it with drive.ts

Preconditions:

- doctor reports `sample game [needs: database] ok`. No Riot key needed: the sample game is stored.
- Signed out, fresh context.

- **Open the game.** Go to `/player/kr/Hide%20on%20bush-KR1/match/KR_8416261221`. Tab `Summary` has `aria-selected="true"` and `Victory` is visible.
- **Review moments.** Scroll the region `Game review` into view. It holds 1–3 buttons named like `In your 60-second review` (saved as `notes.moments`), the text `Think about`, and a `Watch in replay` button.
- **Run.** `npx tsx .claude/skills/verify-turnpoint/scripts/drive.ts [--base <url> | --pr <number>] match-review`.
- **Proof.** `02-60-second-review-has-moments.png` shows Game review with its moments marked; the `.aria.yml` lists them.

## Gotchas

- `Victory` also appears in other sections. Assert it on the summary and the tab state, not on a count.
- The review only shows moments the analysis found. Other games can show fewer than 3; 0 or more than 3 is a failure.
- The `Replay` and `Stats` tabs' content is in the page but hidden. Check `aria-selected` and visibility, not presence.
