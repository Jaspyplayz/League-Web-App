# Game score

Every player in a Summoner's Rift game gets a score from 0 to 100, plus **MVP** for the best player on the winning team and **ACE** for the best on the losing team. It's Turnpoint's own take on op.gg's OP Score. You'll find it on each match row and in the Overview tab of the match panel. Hovering a score shows what helped it and what held it back.

On the match page, it's also the **Overall** tile next to your early, mid and late game ratings, which are trained the same way on each phase of the game (see [phase-ratings.md](phase-ratings.md)).

The code is in [`src/lib/analyzer/score.ts`](../src/lib/analyzer/score.ts), the trained model is [`src/lib/analyzer/score-model.json`](../src/lib/analyzer/score-model.json), [`scripts/train-score.ts`](../scripts/train-score.ts) retrains it, and [`scripts/check-score.ts`](../scripts/check-score.ts) checks it on games it didn't train on.

## How it works

It's a machine learning model: logistic regression, trained on games saved in the database. There are two steps.

**1. Learn what wins games.** For each player in each saved game, the model sees ten stats and whether that player won:

| Stat | Better when |
|---|---|
| KDA, as `log(1 + (kills + assists) / deaths)` | higher |
| Deaths per 10 minutes | lower |
| Kill participation | higher |
| Share of the team's damage to champions | higher |
| Damage to champions per minute | higher |
| Share of the damage the team took | higher |
| Share of the team's gold | higher |
| CS per minute | higher |
| Vision score per minute | higher |
| Damage to objectives (turrets, dragons, Baron) per minute | higher |

First, each stat is compared with what's normal for the player's role (a z-score: how many typical spreads above or below the role's average). This matters because a support's damage share is low by design. Then gradient descent learns one weight per stat, so the weighted sum predicts winning as well as it can. Nobody hand-picks how much a death is worth compared with a ward.

We tell the model one thing up front: which direction is better for each stat (the right column above). If the data ever suggests that dying more helps you win, which can happen by chance with few games, that weight is held at 0 instead. A weight of 0 means the stat didn't help predict wins on top of the others.

**2. Turn the rating into a score.** The weighted sum gives each player a rating. The score is where that rating ranks among every saved player of the same role, so 73 means "rated higher than 73% of junglers in our games". Training saves 101 cut points per role (the 0th to 100th percentile) for that lookup.

Ranking by percentile instead of showing the raw chance of winning is what makes the score useful. Stats like KDA predict the result so well that raw chances bunch up near 0% for losers and 100% for winners. Percentiles spread everyone over 0 to 100. Winners still usually score higher, since good stats win games, but someone who carried a lost game still gets a good score and the ACE badge.

## How good is it?

Two checks measure it, and only the second one tests the weights the site uses.

`npm run train-score` checks the model with **5-fold cross-validation**. It splits the games into five groups and trains on four of them. It then predicts who won in the fifth, which the model has never seen, and repeats this for each group. The accuracy saved in the model (`shared.accuracy`) is how often those predictions were right. A coin flip would get 50%.

All ten players from one game always land in the same group. Teammates share a result, so splitting them up would let the model peek at the answer.

Each of those predictions comes from a model retrained without one group, not from the saved weights. So cross-validation shows how well the training works on the games it had, and says less about the saved model on new games.

`npm run check-score` scores the saved weights on games they could not have trained on. It reads the `score_games` rows collected after the model's `trainedAt`, and leaves out any game the site had saved in `matches` by then, because training reads both tables. It skips games that can't be scored (see [What's not scored](#whats-not-scored)). A pick counts as right when the player's rating is above 0 and they won, or below 0 and they lost, the same rule cross-validation uses. The script saves the game count, the accuracy and the date in the model as `unseen`, and How it works shows them. Training never writes `unseen`, so a retrained model shows no accuracy on How it works until the check runs again.

The first model was trained on the 86 Summoner's Rift games saved in October 2026 (860 players). With that little data it relied mostly on KDA, objective damage, damage taken and deaths, and gave the other stats a weight of 0. More games should let more stats count.

Cross-validation on those 86 games gave **84%**, a small sample to measure on. On 25 October 2026, `npm run check-score` scored the saved model on 35,326 games collected after it was trained, and it picked the winning side **81.1%** of the time. A study on 2026-10-20 got 81.2% on 28,994 later saved games.

Once a role has 300 or more training players (`MIN_ROLE_SAMPLES`), it gets its own weights, since what wins games as a support isn't what wins them as a top laner. Below that, all roles share one set of weights, which is steadier on little data.

## Retraining

The model learns from two tables:

- `matches`: every game someone has opened on the site.
- `score_games`: the end-of-game numbers of all ten players in each game `npm run benchmarks` collects, with no names or PUUIDs. A full benchmarks run adds a few thousand games from every rank.

To retrain:

```sh
npm run benchmarks     # optional, collects more games (slow, needs RIOT_API_KEY)
npm run train-score    # needs DATABASE_URL; makes no Riot calls
```

The script prints the new accuracy and weights. If they look right, commit the new `score-model.json`. Scoring a game on the site costs nothing: the model is a small JSON file bundled with the code.

The new file has no `unseen` check, so How it works stops showing an accuracy. Once `npm run benchmarks` has collected games since the retrain, run `npm run check-score` (needs `DATABASE_URL`, only reads the database) and commit `score-model.json` again.

If you change the list of stats in `SCORE_FEATURES`, retrain before deploying. A saved model trained on a different list is ignored, so scores disappear until it's retrained.

## What's not scored

ARAM, Arena and other modes without roles, games under 10 minutes and early surrenders. They have no score and no Score column.
