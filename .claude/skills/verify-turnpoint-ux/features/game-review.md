# Game review

A game's Summary has a chess-style review in its right column: your scores, how many plays earned each grade, and your plays in time order. Stepping through them moves the board with them, so the eval bar and the strip's mark are always on the play you're reading, and one button takes you to that play in the replay.

## Sub-features

- `review-scores` shows the `Overall`, `Early` and `Mid` tiles (`Late` too in a longer game), and all eleven grades in `Grades of your plays`, with a dash for the three the analyzer can't award.
- `review-opens` opens on the play that moved the game most, on the board and in the list.
- `review-steps` moves the selection with `First play`, `Previous play`, `Next play` and `Last play`, each marked disabled at its end of the list, and keeps the opened play in view inside the list.
- `review-strip` moves the opened play when a mark on the strip is clicked.
- `review-replay` opens the `Replay` tab at the selected play's first whole second from `Start review in the replay`.
- `review-phone` puts Game review under the board and above the scoreboard at phone width, with no sideways scroll and step buttons at least 44px tall.

## How to get to it (user POV)

- Open any game. Game review is on the `Summary` tab, to the right of the board, or under it on a phone.

## Driving it with drive.ts

Preconditions:

- doctor reports `sample game [needs: database] ok`. KR_8419370694 must be saved too.
- Signed out, fresh context.

- **Open the sample.** Go to KR_8416261221. Three tiles, eleven grades, `Book` shows `–`, `Blunder` shows `0`, and the `aria-current` play is 20:54, with its mark pressed and the eval bar on its chance.
- **Step.** `Next play` goes to 22:10, `Previous play` back to 20:54, `First play` to 3:22 and `Last play` to 24:15, the board following each time. At each end the two buttons there are disabled, and the opened play is inside its list's box.
- **Strip.** Click the mark at 5:54. It's the `aria-current` play.
- **The 33:36 play.** Go to KR_8419370694. `First play`, then `Last play`, lands on 33:36. `Start review in the replay` selects `Replay`, and the `Game time` slider's `aria-valuetext` starts `33:37:`.
- **Phone.** Game review starts under the board and ends above `Scoreboard by lane`, `scrollWidth` isn't over `clientWidth`, `Previous play` is at least 44px tall and moves the eval bar, and `Start review in the replay` opens the replay at 18:45.
- **Run.** `npx tsx .claude/skills/verify-turnpoint-ux/scripts/drive.ts [--base <url> | --pr <number>] ux-game-review ux-game-review-phone`.
- **Proof.** Each step's screenshot and ARIA snapshot; `notes.replayAt` holds the slider's text.

## Gotchas

- The 33:36 play is in KR_8419370694, the LeBlanc loss. The sample game, KR_8416261221, is only 24:27 long.
- The step buttons use `aria-disabled` rather than `disabled`, so keyboard focus isn't lost at the ends. Playwright's `toBeDisabled` counts both.
- On a screen under 860px tall the column scrolls with the page instead of sticking, by design.
