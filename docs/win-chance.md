# Win chance

The win chance is each team's chance of winning at every minute of a finished Summoner's Rift game, like the win probability line on sports broadcasts. The match page's **How the game went** panel draws your team's chance as a line under the lead chart, on the same time axis, and **Biggest swings** (lettered A, B, C on the chart) lists the minutes that moved it most, with what each team took in that minute ("The enemy team took Baron and 2 kills, 68% → 38%"). The replay reads it at every second and grades each play by it (see [In the replay](#in-the-replay)).

The code is in [`src/lib/analyzer/win-chance.ts`](../src/lib/analyzer/win-chance.ts), the trained model is [`src/lib/analyzer/win-chance-model.json`](../src/lib/analyzer/win-chance-model.json), and [`scripts/train-win-chance.ts`](../scripts/train-win-chance.ts) trains it. The panel is `match/[matchId]/win-chance.tsx`, fed by `matchWinChance` in [`src/lib/win-chance.ts`](../src/lib/win-chance.ts).

It only ever runs on finished games. Riot's developer policy doesn't allow predictions during a live game.

## How it works

It's a machine learning model: logistic regression, the same kind as the [game score](game-score.md), trained on saved games.

**1. Record each minute.** For every minute of every saved game, we write down both teams' numbers (`TEAM_STATS`): total gold, total XP, kills, towers destroyed, enemy inhibitors down right now, dragons, Baron and Elder buffs, void grubs, Rift Heralds and Atakhan. We also record which side won in the end.

**2. Turn them into leads.** The model looks at how far ahead blue side is (`WIN_CHANCE_FEATURES`). A positive number means blue is ahead and a negative one means red is.

| Feature | What it is |
|---|---|
| `gold` | blue's gold lead, in thousands (2,500 gold ahead is 2.5) |
| `goldLate` | the gold lead again, times minutes / 30, so a lead can count differently late in the game |
| `xp` | blue's XP lead, in thousands |
| `kills` | blue's kills minus red's |
| `towers` | towers blue destroyed minus towers red destroyed |
| `inhibitors` | red inhibitors down minus blue inhibitors down |
| `dragons` | blue's elemental dragons minus red's |
| `soul` | 1 if blue has 4 dragons (soul), -1 if red does |
| `elderBuff`, `baronBuff` | 1 while blue has the buff, -1 while red does |
| `grubs`, `heralds`, `atakhans` | blue's minus red's |

**3. Add them up and squash.** The model has one weight per feature, learned from the games:

```
score       = w_gold × gold + w_goldLate × goldLate + w_xp × xp + ... + w_atakhans × atakhans
blue chance = 1 / (1 + e^(−score))
red chance  = 1 − blue chance
```

The first line adds up how much each lead is worth. The second line, the sigmoid function, turns any score into a chance between 0% and 100%: a score of 0 is 50%, big positive scores get close to 100%, and big negative ones get close to 0%.

There's no extra constant (bias) in the score, so an even game is always exactly 50%, and swapping the sides gives the mirror answer. Blue side does win slightly more often in real games, but leaving that out keeps the model fair to both sides and easier to read.

### The weights it learned

From 18,178 ranked games, Iron to Challenger, on patches 16.16 to 16.20 (trained 2026-10-17):

| Feature | Weight | |
|---|---|---|
| `gold` | 0.397 | per 1,000 gold |
| `goldLate` | −0.206 | per 1,000 gold, times minutes / 30 |
| `xp` | 0.094 | per 1,000 XP |
| `kills` | 0.002 | per kill |
| `towers` | 0 | per tower |
| `inhibitors` | 0.373 | per inhibitor down |
| `dragons` | 0.259 | per dragon |
| `soul` | 0.037 | soul |
| `elderBuff` | 0.246 | Elder buff |
| `baronBuff` | 0.041 | Baron buff |
| `grubs` | 0.026 | per void grub |
| `heralds` | 0.041 | per Rift Herald |
| `atakhans` | 0 | per Atakhan |

Two things stand out:

- **Kills and towers are worth almost nothing on their own.** Not because they don't matter, but because they pay gold, and the gold lead already counts that gold. Counting a kill again on top would count it twice. Inhibitors, dragons, Baron and Elder are different: most of what they're worth is the buff or the pressure, not the gold, so they keep a weight of their own.
- **A gold lead counts for less as the game goes on.** `goldLate` is negative, so 1,000 gold is worth 0.397 − 0.206 × 10/30 = 0.33 at 10 minutes but only 0.397 − 0.206 = 0.19 at 30 minutes, when everyone is close to a full build.

### A worked example

A real minute: KR_8414727148 at 20:00. Blue is 2,302 gold and 1,432 XP ahead, with 2 more towers, 3 void grubs and the Rift Herald, but red has 5 more kills and 1 more dragon.

```
feature    lead                  weight     adds
gold       2.302                 0.397    0.914
goldLate   2.302 × 20/30 = 1.535 −0.206   −0.316
xp         1.432                 0.094    0.135
kills      −5                    0.002   −0.010
towers     2                     0        0
dragons    −1                    0.259   −0.259
grubs      3                     0.026    0.077
heralds    1                     0.041    0.041
                                 score    0.582
blue chance = 1 / (1 + e^(−0.582)) = 1 / (1 + 0.559) = 64%
```

Red's 5 extra kills barely move it, because the gold they earned is already in the gold lead. Blue went on to win.

### Biggest swings

`biggestSwings` compares each minute with the one before. A minute where your team's chance moved by at least 8 points (`MIN_SWING`) counts, and the panel shows the three biggest, in game order. What each side took in that minute comes from the same numbers the model reads (kills, towers, dragons, Baron...), so it describes what happened without saying whether any play was right or wrong. A swing with nothing listed means the gold and XP difference moved on its own, from farm and plates.

### In the replay

The [replay](replay.md) reads the same model at every second: kills, towers and epic monsters from their events, and gold and XP from its estimates between the snapshots (a kill's gold arrives at the second of the kill). Its plays list grades every fight and objective by how much it moved your team's chance. See [how the plays are graded](replay.md#how-the-plays-are-graded).

## How it learns

Training starts with every weight at 0, so the model says 50% for everything. It then goes through all the saved minutes, compares its guesses with who really won, and nudges each weight a little in the direction that makes the guesses better. This is gradient descent, and it repeats 1,000 times (`fitLogistic`).

Before training, each feature is divided by its typical size, because a gold lead of 3 and a Baron buff of 1 aren't on the same scale and one step size has to suit both. The weights are turned back into plain units at the end, so the saved model reads "per 1,000 gold" and "per tower".

We tell the model one thing up front: being further ahead never makes you less likely to win (`alwaysHelps`). If the data ever suggests a dragon lead hurts, which can happen by chance with few games, that weight is held at 0 instead. `goldLate` is the exception, since a gold lead may well count for less at minute 35, when everyone has full builds, than at minute 10.

## How good is it?

`npm run train-win-chance` checks the model with **5-fold cross-validation**: it splits the games into five groups, trains on four and predicts the fifth, which it has never seen, then repeats for each group. All the minutes of one game stay in the same group. Minute 20 and minute 21 of a game look alike and share a result, so splitting them up would let the model peek at the answer.

It prints, and saves in the model's `evaluation`:

- **Accuracy**: how often the team it favoured went on to win.
- **Log loss** and **Brier score**: lower is better. They reward being confident when right and punish being confident when wrong. Always saying 50% scores 0.693 and 0.25.
- **By minute**: accuracy at 10, 15, 20, 25 and 30 minutes, next to the simplest rule there is, "the team with more gold wins". The model should beat it, and both should get better as the game goes on.
- **Calibration**: when the model says 60 to 70%, does blue really win about 65% of the time? A model can be accurate but overconfident, and this table shows it.

The current model, on games it didn't see:

| Minute | Model | More gold wins |
|---|---|---|
| 10:00 | 70% | 70% |
| 15:00 | 77% | 76% |
| 20:00 | 80% | 78% |
| 25:00 | 82% | 81% |
| 30:00 | 82% | 80% |

Log loss 0.513 and Brier score 0.173. It's well calibrated: when it says 90 to 100%, blue wins 96% of the time, and when it says 10 to 20%, blue wins 15%. Gold explains most of a game, so the gold rule is hard to beat early; the model pulls ahead after 20 minutes, when inhibitors, Baron and Elder start deciding games. Patch 16.20 alone scores the same as all five patches, so nothing has changed enough to need a retrain yet.

These numbers make the model look better than it is during a game, because they include the end of each game. `winChanceExamples` keeps every timeline frame, including Riot's last frame at the moment the game ends, when the winner is almost certain. A study on 2026-10-20 found a log loss of about 0.13 in each game's last 2 minutes, against 0.557 in the rest of the game. So the log loss of 0.513 and the Brier score of 0.173 above are both flattered by those last minutes. The by-minute table has the same problem. `evaluate` puts every frame within 30 seconds of a minute into that minute (`Math.round`), so a game that ends between 19:30 and 20:30 adds its last frame to the 20:00 row. The rank table below comes from the same evaluation and has the same problem. A planned evaluation (step 2a of the model plan) counts one frame per game at each minute, and only frames at least 2 minutes before the end. Its numbers will replace these. Until then, the match page quotes no accuracy for the win chance, and How it works shows the by-minute and rank tables with a note that they flatter the model.

## Does rank matter?

Maybe a lead is worth less in Iron, where games get thrown more often, than in Challenger. To check, training also fits a model for each tier on its own, plus Emerald+ and Master+ (`WIN_CHANCE_RANKS`), using only that rank's games. A rank needs at least 800 games (`MIN_RANK_GAMES`). Each rank model is cross-validated on its own games, and so is the all-ranks model on the same games (`allRanks`), so the two can be compared fairly.

A game's rank is the tier of the benchmark player it was collected from (`tier` in each `win_chance_games` game; older rows get it from `benchmark_games`). Players in one game are matched by MMR, so the other nine are close to it. Games opened on the site have no rank and only train the all-ranks model.

The result, on games each model didn't see (log loss, lower is better):

| Rank | Games | Own model | All ranks | At 20:00, own vs all |
|---|---|---|---|---|
| Iron | 1,356 | 0.487 | 0.490 | 81% vs 81% |
| Bronze | 1,133 | 0.528 | 0.529 | 79% vs 79% |
| Silver | 1,331 | 0.509 | 0.507 | 80% vs 79% |
| Gold | 1,461 | 0.518 | 0.516 | 78% vs 78% |
| Platinum | 1,475 | 0.531 | 0.531 | 78% vs 78% |
| Emerald | 1,305 | 0.517 | 0.516 | 80% vs 80% |
| Diamond | 2,086 | 0.513 | 0.511 | 79% vs 79% |
| Master | 2,907 | 0.513 | 0.512 | 80% vs 80% |
| Grandmaster | 2,600 | 0.506 | 0.505 | 80% vs 80% |
| Challenger | 2,444 | 0.518 | 0.517 | 80% vs 80% |
| Emerald+ | 11,342 | 0.512 | 0.512 | 80% vs 80% |
| Master+ | 7,951 | 0.511 | 0.511 | 80% vs 80% |

**A lead is worth about the same at every rank.** The own models are no better than the all-ranks model, and most are a hair worse: they learned from a tenth of the games, so their weights wobble more. A 3,000 gold, 2,000 XP lead at 20:00 comes out between 70% and 74% at every rank. Some ranks are easier to call than others (Iron games 81% at 20:00, Gold 78%), but the all-ranks model already gets that right.

So a rank's own model is only used when its log loss is at least 0.005 lower than the all-ranks model's on the same games (`MIN_RANK_GAIN`, `rankModelHelps`). Smaller gaps are within the luck of which games were collected. Today no rank clears that bar, so every game uses the all-ranks model. The check reruns with every retrain: if a future patch makes leads count differently in some rank, `modelForTier` picks that rank's model for players at that rank (their saved solo queue tier), falling back to Master+ or Emerald+, then all ranks. The How it works page shows the same comparison.

## Patches

The model doesn't update on its own; it's retrained by running one command. Most patches barely change what a lead is worth, but big ones can (a new season, or changes to dragons or Baron). So every saved game keeps its patch, and training prints:

- how many games it found on each patch
- the same checks on just the newest patch (`newestPatch`), next to all patches

If the newest patch's accuracy drops well below the rest, collect fresh games and retrain with `--patches` to use only recent ones.

## Retraining

The model learns from two places:

- `win_chance_games`: both teams' numbers at every minute of each game `npm run benchmarks` collects, with no names or PUUIDs, plus the tier it was collected at. Games older than 60 days are deleted at the end of each run.
- `matches` and `match_timelines`: every game someone has opened on the site.

```sh
npm run benchmarks                         # collects games (slow, needs RIOT_API_KEY)
npm run benchmarks -- --players 40         # 4x the players per rank and server
npm run train-win-chance                   # needs DATABASE_URL; makes no Riot calls
npm run train-win-chance -- --patches 3    # only the 3 newest patches
```

On Windows PowerShell, use `npm.cmd` when passing options after `--`.

The current model came from `--players 40` on 2026-10-16: about 7.5 hours on one dev key, taking the table from 4,077 to 18,114 games. Low ranks end up with fewer games than high ones because their players play less often, so more of their last 20 games are older than 60 days and get deleted. Training took about 2 minutes.

The script prints the accuracy and weights, then the per-rank table above. If they look right, commit the new `win-chance-model.json`, and update the game count in the README (its "At a glance" list and models table) in the same commit. Retake `docs/screenshots/hero.png` too, since the win chance panel's caption shows the count. Showing the win chance on the site costs nothing: the model is a JSON file bundled with the code (about 70 KB with every rank's test results; only the weights reach the browser).

If you change `WIN_CHANCE_FEATURES`, retrain before deploying. A saved model trained on a different list is ignored. If you change `TEAM_STATS`, the saved `win_chance_games` rows no longer match, so empty the table and collect again.
