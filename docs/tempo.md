# Tempo timeline (beta)

The tempo timeline shows, minute by minute, which jungler had the tempo: the time advantage that lets one jungler make the next play (invade, gank, start an objective) while the other has to farm, back or give way. It's on the match page of any game where you played jungle, below the gank log, marked **Beta**.

It's an experiment. Riot doesn't record tempo, so the timeline estimates it from what Riot does record. This page explains how the estimate is made, and how well it held up against real games.

The code is in [`src/lib/analyzer/tempo.ts`](../src/lib/analyzer/tempo.ts) and the panel is `match/[matchId]/tempo.tsx`. The study that set its numbers is [`src/lib/analyzer/tempo-study.ts`](../src/lib/analyzer/tempo-study.ts), run by [`scripts/study-tempo.ts`](../scripts/study-tempo.ts) on games that [`scripts/collect-tempo-games.ts`](../scripts/collect-tempo-games.ts) downloads.

Like the rest of the match page, it describes the situation and never grades a decision. Whether to fight, farm or back depends on waves, vision, cooldowns and health, none of which Riot records between snapshots, and Riot's policies rule out tools that tell players what to do.

## How the call is made

Once a minute, Riot records every player's gold, level and position, and it logs every kill and every item bought with its exact time. From those, at each minute mark, the timeline works out for both junglers:

| Input | Where it comes from |
|---|---|
| Items | Gold spent on items so far: total gold minus unspent gold, both from Riot's snapshot. |
| Level | Riot's snapshot. |
| Alive | Riot logs the moment of each death. The respawn time comes from the game's death timer: a base time for the level, plus up to 50% more as the game goes on. |
| Players alive | The same death timers, for all ten players. |

Then it adds up one lead:

```
lead = items lead + 1,500 × levels ahead + 2,000 × extra players alive on your team
```

- If only one jungler is alive, they're up tempo, whatever the lead. A dead jungler can't make a play.
- Otherwise, a lead of 2,000 or more puts that side up tempo.
- Anything smaller is even.

The three numbers are `LEVEL_GOLD`, `PLAYER_GOLD` and `TEMPO_LEAD` in `tempo.ts`. The study below is where they came from.

### A worked example

A real minute: Qiyana against Shaco at 16:00.

| | Qiyana | Shaco | Counts as |
|---|---|---|---|
| Spent on items | 6,080 | 5,248 | 832 ahead |
| Level | 11 | 11 | 0 |
| Players alive | 5 | 4 | 2,000 ahead |
| **All together** | | | **2,832 ahead: Qiyana up tempo** |

At 9:00 in the same game, Qiyana had spent 934 more on items, at the same level with everyone alive. That's even: in the study, a lead that size won about 52% of next plays, too close to a coin flip to call.

The panel shows these lines for whichever minute you pick, so the total can always be checked by hand.

### Games saved before unspent gold was kept

Turnpoint started keeping unspent gold in saved timelines with this feature. For a game saved before that, item gold is estimated instead: the gold the jungler had earned by their last shop visit, as if they spent all of it there. Riot logs each purchase with its exact time but only records gold once a minute, so the gold at the moment of the visit is read off a straight line between the snapshots either side. In the study, the estimate was 81 gold off at the median and gave the same call as the exact numbers at 93% of minute marks. The panel says when a game uses it.

## What the panel shows

- **The strip**: one block per minute, blue when you were up tempo, red when the enemy jungler was, gray when it was even. Above it are the epic monsters each team took; below it, when each jungler shopped (●) or died (×).
- **The picked minute**: the numbers behind the call, any epic monster that was up or about to spawn, and what each jungler did until the next minute mark: kills, deaths, epic monsters, shop visits, CS, and where they were at the next mark.

Epic monster spawn times come from the game's timers (`DRAGON_SPAWN_MS` and the rest). In the study, no epic monster was ever taken before its timer said it was up.

## The study

The three numbers were set from real games, then checked on games that played no part in setting them.

### What counts as being right

A call is only useful if it matches what happened next. So for each minute mark, the study looks at the **next play** in the following minute: the next kill that either jungler took part in or died in, or the next epic monster. The team that got the kill or the monster won the play. About 3 in 4 minute marks have one; the rest are left out.

Then it asks whether the jungler called up tempo won the next play. Two numbers answer that, always together:

- **Call right**: of the minutes that got a call (not even), how often the side called up tempo won. 50% is a coin flip.
- **Coverage**: the share of minutes that got a call. Calling only the surest minutes would score high on the first and low on this one. Tables write the two as "66% of 58%".

A third number compares ways of measuring a lead without picking a threshold:

- **AUC**: take a minute blue's side won the next play and one it lost; AUC is how often the lead was bigger in the one blue won. 0.5 is a coin flip and 1 would be perfect.

### The games

<!-- Filled in from the final report. -->

### Setting the numbers

The games are split in two by match ID. On the tuning half:

1. **Weights.** A logistic regression (the same kind as the [game score](game-score.md)) learns how much each input helps predict the next play: items lead, levels lead, being the only jungler alive, and players alive. Dividing each weight by the items weight turns it into gold. One level did as much as about 1,500 gold of items, and one extra player alive as much as about 2,000.
2. **Threshold.** A lead counts once the side ahead won 55% of next plays at that size of lead. Below it, the side ahead was barely more likely to win than the side behind, so the minute is called even.

The weights are rounded to make them easy to read and check. Then every number is measured on the check half.

### Results

<!-- Filled in from the final report. -->

### What didn't help

<!-- Filled in from the final report. -->

### Death timers

<!-- Filled in from the final report. -->

### How sure

<!-- Filled in from the final report. -->

## Limits

- Riot records gold, levels and positions once a minute. Anything between two snapshots is unknown, and a lot can change in a minute.
- Riot records nothing about waves, vision, cooldowns or summoner spells, so the call can't include them.
- About 1 in 10 deaths ends sooner than the death timer says, some from revives like Guardian Angel or Zilean's ultimate, so a player can be counted dead for a few seconds after they're back.
- A study game's rank is the rank of the player whose match history it came from. The other nine players are usually close to it.
- Leads are small in the first minutes, so early minutes are usually even.

## Running the study again

```sh
npm run tempo-games                                         # Oceania, every tier (slow, needs RIOT_API_KEY)
npm run tempo-games -- --region na --players 4 --games 6    # a smaller sample from NA
npm run study-tempo -- --out tempo-report.md                # the report; makes no Riot calls
npm run study-tempo -- --tiers gold,platinum                # only some ranks
```

On Windows PowerShell, use `npm.cmd` when passing options after `--`.

The downloader keeps under 70 Riot calls every 2 minutes, and it uses the Oceania server by default because Riot counts each server group's limit separately: the benchmark collector uses NA, EUW and KR, so the two can run at the same time without slowing each other or the live site. The games stay on your computer in `.cache/tempo-study`, one JSON file each, without names or PUUIDs. Git ignores the folder and nothing goes in the database.

When a report suggests different numbers, for example after a big patch, change `LEVEL_GOLD`, `PLAYER_GOLD` and `TEMPO_LEAD` in `tempo.ts`, and update the results here.
