# Win chance

The win chance is each team's chance of winning at every minute of a finished Summoner's Rift game, like the win probability line on sports broadcasts. The match page will draw it as a line, and its biggest jumps are the game's turning points ("Baron took blue from 41% to 68%").

The code is in [`src/lib/analyzer/win-chance.ts`](../src/lib/analyzer/win-chance.ts), the trained model will be `src/lib/analyzer/win-chance-model.json`, and [`scripts/train-win-chance.ts`](../scripts/train-win-chance.ts) trains it.

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

### A worked example

These weights are made up to show the arithmetic. The real ones come from training and will replace them here.

Say at 15:00 blue is 2,000 gold ahead, 1,000 XP ahead, has 1 more tower and 1 more dragon. With weights of 0.40 per 1,000 gold, −0.10 for `goldLate`, 0.20 per 1,000 XP, 0.30 per tower and 0.15 per dragon:

```
gold      = 2.0           0.40 × 2.0 = 0.80
goldLate  = 2.0 × 15/30   −0.10 × 1.0 = −0.10
xp        = 1.0           0.20 × 1.0 = 0.20
towers    = 1             0.30 × 1   = 0.30
dragons   = 1             0.15 × 1   = 0.15
                          score      = 1.35
blue chance = 1 / (1 + e^(−1.35)) = 1 / (1 + 0.26) = 79%
```

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

## Patches

The model doesn't update on its own; it's retrained by running one command. Most patches barely change what a lead is worth, but big ones can (a new season, or changes to dragons or Baron). So every saved game keeps its patch, and training prints:

- how many games it found on each patch
- the same checks on just the newest patch (`newestPatch`), next to all patches

If the newest patch's accuracy drops well below the rest, collect fresh games and retrain with `--patches` to use only recent ones.

## Retraining

The model learns from two places:

- `win_chance_games`: both teams' numbers at every minute of each game `npm run benchmarks` collects, with no names or PUUIDs. Games older than 60 days are deleted at the end of each run.
- `matches` and `match_timelines`: every game someone has opened on the site.

```sh
npm run benchmarks                         # collects games (slow, needs RIOT_API_KEY)
npm run train-win-chance                   # needs DATABASE_URL; makes no Riot calls
npm run train-win-chance -- --patches 3    # only the 3 newest patches
```

On Windows PowerShell, use `npm.cmd` when passing options after `--`.

The script prints the accuracy and weights. If they look right, commit the new `win-chance-model.json`. Showing the win chance on the site costs nothing: the model is a small JSON file bundled with the code.

If you change `WIN_CHANCE_FEATURES`, retrain before deploying. A saved model trained on a different list is ignored. If you change `TEAM_STATS`, the saved `win_chance_games` rows no longer match, so empty the table and collect again.
