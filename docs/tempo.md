# Tempo timeline (beta)

The tempo timeline shows, second by second, which jungler had the tempo: the time advantage that lets one jungler make the next play (invade, gank, start an objective) while the other has to farm, back or give way. When you played jungle, it's part of the [replay](replay.md) on the match page, marked **Beta**.

It's an experiment. Riot doesn't record tempo, so the timeline estimates it from what Riot does record. This page explains how the estimate is made, and how well it held up in 1,923 real games.

The code is in [`src/lib/analyzer/tempo.ts`](../src/lib/analyzer/tempo.ts) and its parts of the replay are drawn by `match/[matchId]/tempo.tsx`. The study that set its numbers is [`src/lib/analyzer/tempo-study.ts`](../src/lib/analyzer/tempo-study.ts), run by [`scripts/study-tempo.ts`](../scripts/study-tempo.ts) on games that [`scripts/collect-tempo-games.ts`](../scripts/collect-tempo-games.ts) downloads.

Like the rest of the match page, it describes the situation and never grades a decision. Whether to fight, farm or back depends on waves, vision, cooldowns and health, none of which Riot records between snapshots, and Riot's policies rule out tools that tell players what to do.

## How the call is made

Once a minute, Riot records every player's gold, level and position. It also logs every kill, every item bought and every skill point with its exact time. From those, the timeline works out for both junglers at every second of the game:

| Input | Where it comes from |
|---|---|
| Items | Gold spent on items so far: total gold minus unspent gold, from Riot's once-a-minute snapshot. Purchases are logged to the second, so the amount steps up at the shop visit: until the jungler's first shop visit after a snapshot it's that snapshot's, and from the visit on it's the next snapshot's, the first one to show what they bought. |
| Level | Each level gives one skill point, and Riot logs each one to the second. Points can be spent a little late, so the count is kept between the levels in the snapshots either side. |
| Alive | Riot logs the moment of each death. The respawn time comes from the game's death timer: a base time for the level, plus up to 50% more as the game goes on. |
| Players alive | The same death timers, for all ten players. |

Then it adds up one lead:

```
lead = items lead + 2,000 × levels ahead + 2,000 × extra players alive on your team
```

- If only one jungler is alive, they're up tempo, whatever the lead. A dead jungler can't make a play.
- Otherwise, a lead of 2,000 or more puts that side up tempo.
- Anything smaller is even.

So a level up, a player up or 2,000 more gold spent on items each count the same, and any one of them is enough on its own. The three numbers are `LEVEL_GOLD`, `PLAYER_GOLD` and `TEMPO_LEAD` in `tempo.ts`, and the study below is where they came from.

Nothing the call uses can change between those logged moments (a snapshot, a death or respawn, a jungler's skill point or shop visit), so the call is worked out once at each of them and holds until the next. Those stretches, a couple of hundred in a typical game, are what the panel draws.

### A worked example

A real moment: Qiyana against Shaco at 16:00.

| | Qiyana | Shaco | Counts as |
|---|---|---|---|
| Spent on items | 6,080 | 5,248 | 832 ahead |
| Level | 11 | 11 | 0 |
| Players alive | 5 | 4 | 2,000 ahead |
| **All together** | | | **2,832 ahead: Qiyana up tempo** |

At 9:00 in the same game, Qiyana had spent 934 more on items, at the same level with everyone alive. That's even: in the study, a side ahead by 500 to 2,000 won only 52% to 54% of next plays, too close to a coin flip to call.

The panel shows these lines for whichever moment you pick, so the total can always be checked by hand.

### Games saved before unspent gold was kept

Turnpoint started keeping unspent gold in saved timelines with this feature. For a game saved before that, item gold is estimated instead: the gold the jungler had earned by their last shop visit, as if they spent all of it there. Riot logs each purchase with its exact time but only records gold once a minute, so the gold at the moment of the visit is read off a straight line between the snapshots either side. In the study, the estimate was 90 gold off at the median and gave the same call as the exact numbers at 96.8% of minute marks. The panel says when a game uses it.

## What the replay shows for junglers

- **The strip**: a row of the replay's timeline, blue while you were up tempo, red while the enemy jungler was and gray while it was even, changing at the second something changed. Under it, when each jungler was dead (the faded bars) and when they shopped (●).
- **Moving through the game**: the replay's controls ([replay.md](replay.md#what-it-shows)). For junglers, the arrow buttons jump to the previous or next change of tempo.
- **The moment you're on**: under the scoreboard, the numbers behind the call, how long the call held, any epic monster that was up or about to spawn, and what each jungler did in the minute after: kills, deaths, epic monsters and shop visits.

Epic monster spawn times come from the game's timers (`DRAGON_SPAWN_MS` and the rest). None of the 13,738 epic monsters in the study was taken before its timer said it was up.

## The study

The three numbers were set on half of the study's games, then checked on the other half, which played no part in setting them. The study makes the call at Riot's minute marks, the way the first version of the panel did; [Second by second](#second-by-second) checks the call the panel makes now.

### What counts as being right

A call is only useful if it matches what happened next. So for each minute mark, the study looks at the **next play** in the following minute: the next kill that either jungler took part in or died in, or the next epic monster. The team that got the kill or the monster won the play. About 3 in 4 minute marks have one; the rest are left out.

Then it asks whether the jungler called up tempo won the next play. Two numbers answer that, always together:

- **Call right**: of the minutes that got a call (not even), how often the side called up tempo won. 50% is a coin flip.
- **Coverage**: the share of minutes that got a call. Calling only the surest minutes would score high on the first and low on this one. Tables write the two as "65% of 60%".

A third number compares ways of measuring a lead without picking a threshold:

- **AUC**: take a minute blue's side won the next play and one it lost; AUC is how often the lead was bigger in the one blue won. 0.5 is a coin flip and 1 would be perfect.

### The games

1,923 ranked solo/duo games from the Oceania server, downloaded on 2026-10-16 with `npm run tempo-games`:

| Ranks | Games |
|---|---|
| Challenger, Grandmaster, Master | 328, 255, 344 (40 players each, up to 10 games each) |
| Diamond, Emerald | 140, 149 (15 players each) |
| Platinum, Gold | 145, 140 |
| Silver, Bronze, Iron | 144, 136, 142 |

That's 53,489 minute marks, 38,920 of them followed by a play within a minute. Most games are from patches 16.19 and 16.20; players in lower ranks play less often, so their last ten games go back as far as patch 16.1. Every minute is counted once, from blue's side, so both junglers are in it.

Oceania, because Riot counts each server group's rate limit separately. The benchmark collector was using NA, EUW and KR at the same time, so downloading from Oceania didn't slow it down or the live site.

### Setting the numbers

The games are split in two by match ID: 951 to tune the numbers and 972 to check them. On the tuning half:

1. **Weights.** A logistic regression (the same kind as the [game score](game-score.md)) learns how much each input helps predict the next play: items lead, levels lead, being the only jungler alive, and players alive. Dividing each weight by the items weight turns it into gold. One level did as much as about 2,050 gold of items, and one extra player alive as much as about 2,100.
2. **Threshold.** A lead counts once the side ahead won 55% of next plays at that size of lead. Below it, the side ahead was barely more likely to win than the side behind, so the minute is called even. With those weights, that came out at about 2,200.

All three are rounded to 2,000, so that a level, a player or 2,000 gold of items each count the same and any one is enough. Rounding the threshold down from 2,200 makes a call at more minutes (63% instead of 60% of them) and is right a little less often (64.6% instead of 65.0%), well within the uncertainty (below).

The same fit on each group of ranks:

| Ranks | Games | Gold per level | Gold per player alive | Lead for 55% |
|---|---|---|---|---|
| Master and up | 927 | 1,750 | 1,850 | 2,000 |
| Emerald, Diamond | 289 | 1,850 | 2,300 | 2,200 |
| Gold, Platinum | 285 | 1,950 | 2,300 | 2,650 |
| Iron, Bronze, Silver | 422 | 3,150 | 2,350 | 2,650 |

A player alive is worth about the same at every rank. A level counts for more in Iron to Silver, and every group below Master needs a slightly bigger lead before the side ahead wins 55%. One set of numbers keeps the timeline simple to read, and it's about as often right at every rank (below).

### Results

On the 972 check games, against the first guess the timeline started with and the other ways of making the call the study tried, each tuned on the other half the same way:

| Call | Lead | Up tempo from | Next play | AUC | Epic monsters, called 1+ min before | One jungler killing the other | Even minutes |
|---|---|---|---|---|---|---|---|
| **Final** | items + 2,000 a level + 2,000 a player | 2,000 | 64.6% of 63.2% | 0.644 | 61.7% of 63.2% | 61.3% of 61.4% | 38.4% |
| First guess | items + 300 a level | 500 | 61.5% of 74.4% | 0.632 | 59.0% of 76.0% | 58.5% of 73.7% | 28.4% |
| Without players alive | items + 2,400 a level | 2,250 | 64.0% of 60.6% | 0.638 | 62.1% of 60.3% | 60.4% of 58.5% | 41.0% |
| Total gold instead of items | gold + 2,400 a level + 2,350 a player | 2,600 | 64.8% of 61.0% | 0.643 | 62.2% of 62.4% | 61.4% of 58.8% | 41.0% |
| Who's alive from health snapshots | items + 2,200 a level + 2,250 a player | 2,350 | 64.7% of 59.3% | 0.639 | 62.0% of 60.3% | 61.9% of 57.5% | 43.0% |
| Lead as a share of the junglers' gold | the tuned lead ÷ their average gold | 46% | 64.7% of 54.5% | 0.638 | 61.5% of 54.9% | 61.6% of 49.0% | 44.7% |

In words:

- When the timeline makes a call, the side it calls up tempo wins the next play 64.6% of the time, on games that played no part in setting it. It makes a call at 63% of minutes; the rest are even.
- The first guess called more minutes but was right less often. Counting levels for far more (2,000 instead of 300) and adding players alive made the biggest difference.
- Calls get more common and more often right as the game goes on: right 60.7% of the time at 44% of minutes 2 to 14, 66.0% at 75% of minutes 15 to 24, and 66.5% at 82% of minutes from 25 on. Early leads are small, and a small lead barely changes who wins the next play.
- It holds at every rank, across all the games: right 64.2% of the time in Master and up, 65.4% in Emerald and Diamond, 62.4% in Gold and Platinum, and 64.3% in Iron, Bronze and Silver.
- The tempo lead, which only looks at the two junglers and who's alive, predicts the next play as well as the whole team's gold lead (AUC 0.625 against 0.627, all games), and clearly better than the junglers' gold alone (0.596).
- Across all the games, when an epic monster was taken, the side called up tempo a minute or more before took it 61.4% of the time (Baron 64.7%, dragons 61.6%, Rift Herald 61.1%, void grubs only 55.3%). When one jungler killed the other, the one called up tempo at the minute before was the killer 60.6% of the time.

### Checking the checks

The next play is one way of measuring "right", and it has choices in it, so the final call was measured a few other ways too (all games):

| Measure | Moments | Call right | AUC of the lead | AUC of team gold |
|---|---|---|---|---|
| Next play within 30 seconds | 25,698 | 65.2% of 62.9% | 0.631 | 0.631 |
| Within a minute (the main measure) | 38,920 | 64.1% of 62.3% | 0.625 | 0.627 |
| Within 2 minutes | 49,630 | 62.7% of 61.2% | 0.617 | 0.624 |
| Within a minute, no kill in the 20 seconds before | 22,036 | 62.7% of 53.9% | 0.608 | 0.620 |
| Within a minute, no kill in the minute before | 7,594 | 61.0% of 49.0% | 0.592 | 0.595 |

The call is still right 61.0% of the time in quiet minutes, with no kill in the minute before, so it isn't only picking the winner of a fight that's already happening. It's a little less sure further ahead, as you'd expect: a lot changes in two minutes.

### Second by second

The first version of the panel made the call once a minute, at Riot's snapshots. Early death timers are 10 to 20 seconds, so most early deaths came and went between two snapshots and never showed in the colors. The call made at every second fixes that, but is it more often right? The study checked both on the same 1,923 games with the same three numbers: every 5 seconds from 2:00, each call against the next play within a minute.

| Moments | Count | Every second | Once a minute |
|---|---|---|---|
| All games | 464,064 | 63.9% of 62.9% | 60.3% of 61.6% |
| Check games only | 235,836 | 64.0% of 63.5% | 60.8% of 62.5% |
| Only where the two calls differ | 163,217 | 60.5% of 61.4% | 49.5% of 57.7% |
| No kill in the 20 seconds before | 263,518 | 62.4% of 54.4% | 60.1% of 59.9% |
| Master and up | 216,639 | 64.4% of 62.2% | 60.8% of 60.9% |
| Emerald, Diamond | 70,390 | 64.0% of 62.6% | 60.4% of 61.1% |
| Gold, Platinum | 73,129 | 62.4% of 63.4% | 58.3% of 62.3% |
| Iron, Bronze, Silver | 103,906 | 63.9% of 64.3% | 60.7% of 63.0% |

- The call made every second is right 63.9% of the time, against 60.3% for the call made once a minute, and makes a call about as often. The 95% range of the gain, from redrawing the games, is 3.4 to 3.7 points.
- The two calls differ at 36% of moments. There, the once-a-minute call is a coin flip (49.5%), because it's usually still showing a situation that has already changed, and the call made every second is right 60.5% of the time.
- Leaving out the 20 seconds after a kill, when the next play is often the rest of the same fight, the gain is smaller (2.2 points), and the call made every second calls fewer of those moments.
- At the minute marks themselves the two agree 98.7% of the time. The rest are skill points logged a moment before a snapshot that still shows the old level.
- It holds at every rank, by 3.2 to 4.1 points.

### What didn't help

- **Shop timing.** This was the surprise. When both junglers had earned about the same gold (within 250), the one who had spent more of it on items won no more next plays than the other: 47% to 53% across the whole range, with no trend. In this data the next play went to whoever had earned more, whether or not they'd been back to spend it. Either a minute is too short to see it, or once-a-minute snapshots are too coarse. The call still uses gold spent on items, which matches how junglers think about tempo and did as well as total gold, and the strip shows every shop visit so you can see the timing yourself.
- **Camps and time since shopping.** Monsters killed in the last two minutes and time since the last shop visit added nothing measurable (log loss 0.6520 with and without them).
- **Health.** Health at the minute mark helps a little at the extremes: with gold about even, the side at much lower health won 39% of next plays and the side at much higher health 60%. Turnpoint doesn't save health, and a snapshot of health says little about a fight a minute later, so it's left out.
- **Who's alive from health snapshots.** Riot's snapshots say who's at 0 health, so the study tried that instead of the death timer. It was slightly worse (AUC 0.639, against 0.644 for the same call with death timers), so the death timer stays.
- **A lead as a share of gold**, so that 1,000 counts for more at 10 minutes than at 30: no better (AUC 0.638), and it called fewer minutes.
- **Team gold.** Adding the two teams' total gold to the timeline's inputs predicts the next play better still (AUC 0.656 against 0.640 without it). It's left out because the timeline is about the junglers' situation, not a forecast of who wins the next fight.

### Death timers

Riot's snapshots include health, which made it possible to check the death timer formula. For 96,292 deaths followed by a minute mark within twice their timer, the formula and the snapshot agreed 89.8% of the time. Where they didn't, the player was usually back sooner than the formula said: 8,757 times, with a median of 19 seconds still on the formula's timer. The other way round, 1,101 players were still at 0 health after the formula had them back, by a median of 1.5 seconds.

Making every timer longer or shorter doesn't help (the best scale is 1.00), and revives explain little: Guardian Angel, Zilean, Akshan, Sion, Zac or Anivia were in the game for 6.7% of the early returns, against 4.9% of all deaths. The study couldn't find the cause. Using the snapshots instead made the call slightly worse (above), so the formula stays.

### How sure

95% ranges from redrawing the games 200 times:

| Number | Value | 95% range |
|---|---|---|
| Call right, all games | 64.1% | 63.6% to 64.8% |
| Call right, check games only | 64.6% | 64.0% to 65.2% |
| AUC gain over the first guess, check games only | 0.011 | 0.008 to 0.016 |
| AUC of the tempo lead, all games | 0.625 | 0.618 to 0.632 |
| The same, minus the junglers' gold alone | 0.029 | 0.025 to 0.030 |
| The same, minus team gold | −0.002 | −0.006 to 0.004 |
| Epic monsters, call right 1+ minute before | 61.4% | 60.3% to 63.0% |

So the gains over the first guess and over the junglers' gold are real, and the tempo lead and team gold are a tie.

## Limits

- Riot records gold and positions once a minute. Item gold comes from those snapshots, stepping up at each shop visit, so two visits in the same minute show as one step at the first.
- A level counts as 2,000 gold, the whole threshold on its own, so a jungler who levels a few seconds before the other is up tempo for those seconds. The strip shows these as thin slivers.
- Riot records nothing about waves, vision, cooldowns or summoner spells, so the call can't include them.
- About 1 in 10 deaths ends sooner than the death timer says, and the study couldn't find out why, so a player can be counted dead for a while after they're back.
- All the study's games are from Oceania. Other servers play the same game, but weren't checked.
- A study game's rank is the rank of the player whose match history it came from. The other nine players are usually close to it.
- Leads are small in the first minutes, so early on the call is usually even.

## Running the study again

```sh
npm run tempo-games                                         # Oceania, every tier (slow, needs RIOT_API_KEY)
npm run tempo-games -- --region na --players 4 --games 6    # a smaller sample from NA
npm run study-tempo -- --out tempo-report.md                # the report, ending with the second-by-second check; makes no Riot calls
npm run study-tempo -- --tiers gold,platinum                # only some ranks
```

On Windows PowerShell, use `npm.cmd` when passing options after `--`.

The downloader keeps under 70 Riot calls every 2 minutes. It uses the Oceania server by default because the benchmark collector uses NA, EUW and KR, so the two can run at the same time. The games stay on your computer in `.cache/tempo-study`, one JSON file each, without names or PUUIDs. Git ignores the folder and nothing goes in the database. Downloading all ten tiers took about two hours. With `--items`, it downloads games for the replay's item check instead ([replay.md](replay.md#running-the-checks)).

When a report suggests different numbers, for example after a big patch, change `LEVEL_GOLD`, `PLAYER_GOLD` and `TEMPO_LEAD` in `tempo.ts`, and update the results here.
