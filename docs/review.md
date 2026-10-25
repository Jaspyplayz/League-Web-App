# 60-second review

Reviewing a 30-minute game takes too long, and most players don't know what to look for, so most never do it. The 60-second review makes it short: near the top of a game's Summary tab (under the scoreboard and the strip with your matchup and phase ratings), the three plays you were in that moved your team's chance to win the most, each with a question to think over and a button that opens the replay at that second.

The moments are picked in [`src/lib/analyzer/review.ts`](../src/lib/analyzer/review.ts) from the replay's [graded plays](replay.md#how-the-plays-are-graded). The panel is `match/[matchId]/review.tsx`, and its buttons reach the replay and the notes box through `review-links.tsx`, which the tabs (`analysis-tabs.tsx`) hold.

## Which plays

1. **Plays you were in**: you got a kill or an assist, died, or helped take an epic monster. That's the same rule as the **Yours** filter in the replay's plays list. Riot doesn't log who took a tower, so a tower on its own never counts as yours.
2. **That moved the chance by a point or more**, either way. Smaller ones are graded Even and are mostly farming noise.
3. **The three that moved it most**, shown in game order.

A game can have fewer than three, and a game where you weren't in any such play says so. Games the [win chance](win-chance.md) model doesn't cover have no review.

A play's size is Win Probability Added: how much it changed your team's chance to win. That says what the play did to the game, not whether it was the right call. A fight that was the right call can still go wrong, and once a game is decided even a big fight barely moves the chance (see [replay.md](replay.md#how-the-plays-are-graded)).

## Each moment

- **The time and what happened**, named the way the replay's plays list names it: "Won a fight 3 for 0, your team took Dragon".
- **The grade and the chance before and after**: "Mistake −4.1%, from 52.2% to 48.1%".
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

- **Watch in replay** opens the Deep dive tab with the replay at the play's first second, with the play shown in the play bar under the timeline, so the map, scoreboard and timers show the moment.
- **Add to notes** adds a line like "6:30 Lost a fight 0 for 2: " to your [private notes](../src/app/player/[region]/[riotId]/match/[matchId]/match-notes.tsx) on the game, ready to finish and save. It's hidden when sign-in isn't set up. Signed out, it takes you to the "Sign in" line where the notes box would be, and when your note couldn't be loaded, to the line saying so.

## Not yet

From the [breakthrough ideas](https://claude.ai/code/artifact/d4b1b36f-705f-4cde-9b94-753d74520ec7) write-up, these come later: checking your Focus goal for the game, and personal records ("your fastest first item on this champion this month").
