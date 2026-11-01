# 60-second review

Reviewing a 30-minute game takes too long, and most players don't know what to look for, so most never do it. The 60-second review makes it short: the three plays you were in that moved your team's chance to win the most, each with a question to think over and a button that opens the replay at that second. They're marked "60s" in Game review, the right column of a game's Summary tab (on a phone, right under the board), among all the plays you were in.

The moments are picked in [`src/lib/analyzer/review.ts`](../src/lib/analyzer/review.ts) from the replay's [graded plays](replay.md#how-the-plays-are-graded). The column is `match/[matchId]/game-review.tsx`, and its buttons reach the replay and the notes box through `review-links.tsx`, which the tabs (`analysis-tabs.tsx`) hold.

## Game review

Game review is modelled on chess.com's game review. Top to bottom it has your scores (Overall, then the Early, Mid and Late [phase ratings](phase-ratings.md)), how many of your plays earned each grade, and your plays in time order. The scale has eleven grades. The analyzer can award eight, and the other three (Best, Book and Miss) show a dash until it can ([decision record 0023](adr/0023-chess-style-grades.md)).

One play is opened at a time. It opens on the play that moved the game most, the same one the board's eval bar starts on, because `summary-columns.tsx` holds the selection for both of them. Choosing a play in the list, on the strip or with the first, previous, next and last buttons moves the eval bar, the strip's mark and the chart's cursor together. "Start review in the replay" opens the Replay tab at the selected play.

## Which plays

1. **Plays you were in**: you got a kill or an assist, died, or helped take an epic monster. That's the same rule as the **Yours** filter in the replay's plays list. Riot doesn't log who took a tower, so a tower on its own never counts as yours.
2. **That moved the chance by a point or more**, either way. Smaller ones are graded Even and are mostly farming noise.
3. **The three that moved it most**, shown in game order.

A game can have fewer than three, and a game where you weren't in any such play says so. Games the [win chance](win-chance.md) model doesn't cover have no plays or grades. Game review then shows only your scores, or isn't drawn if the game has none.

A play's size is Win Probability Added: how much it changed your team's chance to win. That says what the play did to the game, not whether it was the right call. A fight that was the right call can still go wrong, and once a game is decided even a big fight barely moves the chance (see [replay.md](replay.md#how-the-plays-are-graded)).

## Each moment

Any play you open in Game review shows the time, what happened, the grade and the chance. Only a moment has the tempo line, the question and "Add to notes".

- **The time and what happened**, named the way the replay's plays list names it: "Won a fight 3 for 0, your team took Dragon", with one line per kill or objective under it.
- **The grade and the chance before and after**: "Mistake −4.1%, from 52.2% to 48.1%". The grade is the replay's, from Brilliant to Blunder ([how the plays are graded](replay.md#how-the-plays-are-graded)). The moments are the biggest moves, so they're mostly Excellent, Great, Mistake or Blunder, with Good or Inaccuracy in a quiet game.
- **For junglers, who had tempo** just before it, from the [tempo timeline](tempo.md).
- **A question to think over**, picked by what happened:

| What happened | Question |
|---|---|
| The chance dropped and you died in it | What did you know about where the enemy team was just before you died? |
| The chance dropped and the enemy took an objective | What was your team doing when the enemy team started on it? |
| The chance dropped otherwise | What did you see just before this fight started? |
| The chance rose with a fight and an objective | What set up the fight, and how did it turn into the objective? |
| The chance rose with an objective alone | What made it safe to take when you did? |
| The chance rose otherwise | What set this up, and could you make it happen again? |

The questions ask what you knew or saw, never what you should have done. Riot's rules don't allow apps to dictate players' decisions, and the grade can't tell a bad call from bad luck.

- **Watch in replay** opens the Replay tab with the replay at the play's first second, with the play shown in the play bar under the timeline, so the map, scoreboard and timers show the moment.
- **Add to notes** adds a line like "6:30 Lost a fight 0 for 2: " to your [private notes](../src/app/player/[region]/[riotId]/match/[matchId]/match-notes.tsx) on the game, ready to finish and save. It's hidden when sign-in isn't set up. Signed out, it takes you to the "Sign in" line where the notes box would be, and when your note couldn't be loaded, to the line saying so.

## Not yet

From the [breakthrough ideas](https://claude.ai/code/artifact/d4b1b36f-705f-4cde-9b94-753d74520ec7) write-up, these come later: checking your Focus goal for the game, and personal records ("your fastest first item on this champion this month").
