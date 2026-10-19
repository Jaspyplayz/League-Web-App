# Habits

A few early-game habits, read from each game's match and timeline: whether you hit level 6 before your opponent, how the first scuttle crabs went, when your first gank landed and when you first went back. Insights will show how often you do each one, how often players of the rank you pick do, and how often games with and without it were won at that rank.

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
