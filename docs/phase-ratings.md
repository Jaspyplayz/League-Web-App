# Phase ratings

Each game on the match page gets four 0 to 100 numbers in the **Game by phase** panel of the Summary tab: one each for your early, mid and late game, plus an overall rating, which is your [game score](game-score.md) (the number on the match row). Each tile says what helped or held back that phase the most.

Like the game score, these are performance numbers: how your stats in that part of the game compare with other players in your role. They don't grade your decisions.

The code is in [`src/lib/analyzer/phase-score.ts`](../src/lib/analyzer/phase-score.ts), the trained models are in [`src/lib/analyzer/phase-score-model.json`](../src/lib/analyzer/phase-score-model.json), and [`scripts/train-phase-score.ts`](../scripts/train-phase-score.ts) trains them. The panel is `match/[matchId]/phase-ratings.tsx`.

## The phases

| Phase | Minutes | Why it ends there |
|---|---|---|
| Early | 0 to 14 | Turret plates fall at 14:00 |
| Mid | 14 to 25 | Around when Baron fights and full builds start |
| Late | 25 to the end | |

A phase needs at least 5 minutes of game (`MIN_PHASE_MINUTES`) to be rated, so a game needs 19 minutes for a mid rating and 30 for a late one. Shorter phases are left out because a couple of minutes is too little to judge.

## How it works

It's the game score's recipe (logistic regression, then a percentile within your role), trained three more times, once per phase. The code is shared: `trainRoleModels` and `rate` in [`score.ts`](../src/lib/analyzer/score.ts).

**1. Cut the game into phases.** The timeline has a snapshot of every player each minute, so a phase's gold, XP, CS and damage are the snapshot at its end minus the one at its start. Kills, deaths, assists and epic monsters come from the timeline's events inside the phase.

**2. Turn them into stats** (`PHASE_FEATURES`):

| Stat | Better when |
|---|---|
| KDA, as `log(1 + (kills + assists) / deaths)` | higher |
| Deaths per 10 minutes | lower |
| Kill participation | higher |
| Share of the team's damage to champions | higher |
| Damage to champions per minute | higher |
| Share of the team's gold | higher |
| CS per minute | higher |
| Gold gained on your lane opponent per minute | higher |
| XP gained on your lane opponent per minute | higher |
| Share of the team's epic monsters you were in on (dragons, grubs, Herald, Baron, Atakhan) | higher |

Vision score and damage to objectives are missing: Riot only gives them as end-of-game totals, not per minute. That's one reason the overall rating stays the game score, which can use them.

**3. Learn what wins.** Each stat is compared with what's normal for your role in that phase (a z-score), since a jungler's early CS isn't a top laner's, and a 14-minute early game isn't an 8-minute late game. Then gradient descent learns how much each stat goes with winning. Each role gets its own weights once it has 300 players in the phase, which every role has.

**4. Turn the rating into a 0 to 100 score.** The score is where your rating ranks among every saved player of the same role in the same phase: 71 means higher than 71% of them.

## What it learned

Trained on 2026-10-20 on the 1,923 Oceania ranked games of the [tempo study](tempo.md), Iron to Challenger. 1,797 of them lasted long enough for a mid rating and 831 for a late one. Accuracy is from 5-fold cross-validation (see [game-score.md](game-score.md#how-good-is-it)): how often the shared weights picked the winner in games they hadn't seen.

| Phase | Games | Accuracy | Biggest weights (shared) |
|---|---|---|---|
| Early | 1,923 | 62% | gold lead 0.27, KDA 0.25, XP lead 0.17 |
| Mid | 1,797 | 73% | KDA 0.51, XP lead 0.51, gold lead 0.38 |
| Late | 831 | 81% | XP lead 1.01, KDA 0.77, gold lead 0.46 |

Two things stand out:

- **Early is the hardest phase to read.** A good early game wins 62% of the time; a lot can still happen. Later phases sit closer to the result, so they predict it better.
- **What you gain on your opponent matters most.** Once KDA and the gold and XP leads are known, the shares (damage, gold) and CS per minute add nothing, so their shared weights are 0. A role's own weights can still use them.

## Retraining

```sh
npm run tempo-games          # optional, downloads more games (slow, needs RIOT_API_KEY)
npm run train-phase-score    # reads .cache/tempo-study, plus the site's games when DATABASE_URL is set
```

`--folder` points it at another copy of the tempo study's games. It makes no Riot calls. It prints each phase's accuracy and weights; if they look right, commit the new `phase-score-model.json`. If you change `PHASE_FEATURES`, retrain before deploying: a model trained on a different list is ignored, and the panel hides until it's retrained.

## What's not rated

The same games the game score skips (ARAM, Arena, remakes, early surrenders, games under 10 minutes), games where a team is missing a role, and phases under 5 minutes. The match page only analyzes games of 15 minutes or more, so in practice every analyzed game has an early rating.
