# Personal records

Your best this season at a few early-game stats, per role and per champion in that role: "Most CS at 10 in your 23 Lee Sin games this season: 82 CS, beating 76 CS." When a game sets one, the [60-second review](review.md) on its Summary tab says so at the top, and the **Personal records** section at the bottom of the Champions tab lists them all, each linking to the game that set it.

The rules are pure functions in [`src/lib/analyzer/records.ts`](../src/lib/analyzer/records.ts). [`src/lib/record-store.ts`](../src/lib/record-store.ts) saves each game's numbers and loads a season of them. The review's lines are [`review-records.tsx`](../src/app/player/[region]/[riotId]/match/[matchId]/review-records.tsx) and the Champions tab's tables are [`personal-records.tsx`](../src/app/player/[region]/[riotId]/champions/personal-records.tsx).

## Which stats

Only stats that go with winning, so a record is worth chasing. Kills, damage or late-game CS would mostly say the game went long.

| Record | How it's read | Why it counts |
|---|---|---|
| Most CS at 10 | your lane minions plus jungle monsters at the 10:00 frame; not for supports | CS is most of your early gold |
| Biggest gold lead at 15 | your gold minus your lane opponent's at 15:00 | the gold lead is the [win chance](win-chance.md) model's main input, and counts most early in the game |
| Earliest level 6 | the second of your sixth skill point, as in [Habits](habits.md) | "Level 6 first" on Insights' [Habits](habits.md) shows how much more often games were won with it |
| Fewest deaths before 14:00 | your deaths before 14:00, the same cutoff as Insights' early deaths | an early death hands over gold and map control |
| Most takedowns before 14:00 | your kills plus assists before 14:00 | an early takedown is gold and tempo; Habits' "Lane takedown before 6:00" shows its win rates |

Like Habits, these say what tends to go with winning, not that one caused the other: players who are already ahead also farm more and hit 6 sooner.

## When a game sets one

- A record is the best of your games **this season** (`SEASON` in [`src/lib/season.ts`](../src/lib/season.ts)) in the **same queue**, so solo queue and flex records stay apart.
- **In a role**, or **on a champion in that role**. The review shows the role record when a game set both, since it's harder to beat.
- It has to **beat every earlier game**. A tie doesn't count, so the first game to reach a number keeps it, and a 0-death record can't be set again once you have one.
- It needs **5 games** with the stat, the record game included (`MIN_RECORD_GAMES`). Without that, your first few games on a new champion would each set a record, which is padding, not progress.
- The line sits in the 60-second review, so games the [win chance](win-chance.md) model doesn't cover (and so have no review) don't show one.
- Opening an older game still shows the record it set at the time. If a later game beat it, the line says so: "in your first 12 Lee Sin games ... You've since reached 85 CS."

## Which games count

Records need the minute-by-minute timeline, and fetching a whole season of timelines from Riot would use up the rate limit. So records only use games whose timeline Turnpoint has already saved: the games someone opened, and the ones Insights read (20 to 100 of your latest). They never call Riot, and the Champions tab says how many games they come from.

Each game's numbers are worked out once and saved in `record_games` (migration 0019), a few small numbers per player per game, so a season can be compared without reading every timeline again. A page view works out at most 10 new games on the match page and 25 on the Champions tab, newest first, so a player with hundreds of saved games fills in over a few visits. The game you're looking at is always worked out from the page's own data, so its review line never waits.

When a stat's rule changes, bump `RECORDS_VERSION` in `record-store.ts`: rows saved by an older version are worked out again from the saved timelines.

## Not yet

- Records over a month, or all time, rather than this season.
- More stats that go with winning, like first scuttles for junglers, once there's a way to show which ones a role cares about.
