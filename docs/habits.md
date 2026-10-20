# Habits

A few early-game habits, read from each game's match and timeline: whether you hit level 6 before your opponent, how the first scuttle crabs went, when your first gank landed and when you first went back. The **Habits** section of Insights shows how often you do each one, how often players of the rank you pick do, and how often games with and without it were won, by you and at that rank.

These are patterns, not grades. Hitting 6 first goes with winning partly because players who are already ahead hit 6 first, and backing early can be right or wrong depending on the wave, your health and the enemy jungler. The numbers say what tends to happen, not what you should have done in a game.

The code is in [`src/lib/analyzer/habits.ts`](../src/lib/analyzer/habits.ts). Each game's habits are part of its Insights summary (`GameTrend` in [`trends.ts`](../src/lib/analyzer/trends.ts)), and `npm run benchmarks` saves them for every benchmark game (stats version 4, see [database.md](database.md#benchmark-games)).

## What counts

| Habit | Who | How it's read |
|---|---|---|
| `level6First` | everyone | You reached level 6 before your opponent in the same role. Riot logs every skill point to the second and each level gives one, so the sixth point is when you hit 6. Null when neither of you got there. |
| `firstScuttleLead` | junglers | Scuttle crabs you took at their first spawn (3:30) minus the enemy jungler's, from Riot's `initialCrabCount`, so from -2 to 2. Riot's timeline doesn't log scuttle kills, so the timing within the spawn isn't known. |
| `firstGankS` | junglers | Seconds into the game of your first kill or assist in a lane, before 14:00. Riot only records ganks that ended in a kill, so a gank that burned a Flash but got nothing doesn't count. |
| `firstBackS` | everyone | Seconds into the game of your first trip to the shop after 2:00, before 14:00. Null when that trip came from dying, since that back wasn't a choice, and when you didn't go back before 14:00. |

The trip to the shop is found the same way as in the [tempo timeline](tempo.md): items are logged to the second and can only be bought in base, so a run of purchases is one visit.

## On Insights

The section is [`insights/habits.tsx`](../src/app/player/%5Bregion%5D/%5BriotId%5D/insights/habits.tsx), fed by `compareHabits` in [`src/lib/analyzer/habit-trends.ts`](../src/lib/analyzer/habit-trends.ts). It's about the role you played most in the games on the page (pick a champion to narrow it), and compares you with that rank's games in the same role, picked in **You vs [rank]** (on the You vs others tab; the Habits and sessions tab keeps that choice).

Each habit becomes a yes or no for every game:

| Card | Yes when |
|---|---|
| Level 6 first | `level6First` |
| First scuttles | you took more first-spawn scuttles than the enemy jungler (`firstScuttleLead` above 0); 1 each counts as no |
| Lane takedown before 6:00 | `firstGankS` before 6:00 (`EARLY_GANK_S`); a jungler with no lane takedown before 14:00 counts as no |
| First back before (a time) | `firstBackS` before the rank's median first back in your role, or your own median when the rank has fewer than 10 games with one. The time on the card is that median. |

A game where the habit can't be told (null) is left out of that card. Then each card shows:

- **How often you did it**, and how often the rank did. The first back card leaves the rank's rate out, since the rank backs before its own median in half its games by definition.
- **Win rate with it and without it**, for you and for the rank, with the game counts. Your own numbers come from 20 to 100 games, often fewer than 10 on one side, so they're rough; the counts are there so you can tell.
- **The difference** at the rank: "Diamond games were won 10 points more often with it." Without rank games, it's your own difference.

A card needs at least 3 of your games where the habit is known (`MIN_HABIT_GAMES`), and the rank columns need at least 10 of the rank's games on each side (`MIN_BENCHMARK_GAMES`, the same as You vs [rank]). Benchmark games saved before version 4 have no habits and are skipped, so until `npm run benchmarks` refills them, the cards show only your numbers.
