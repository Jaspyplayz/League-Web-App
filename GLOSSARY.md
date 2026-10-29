# Turnpoint

Turnpoint analyzes a player's League of Legends games against their lane opponent, then looks across many games for habits and weaknesses worth working on. These are the words the app and its docs use for what it shows.

## Language

### Players

**Player**:
A person whose games Turnpoint shows, found by searching their Riot ID.
_Avoid_: Summoner, account, user

**Riot ID**:
The `Name#TAG` a player is known by in League and searched by in Turnpoint.
_Avoid_: Username, summoner name

**Region**:
The server a player plays on, such as NA, EUW or KR.
_Avoid_: Server, shard

**Rank**:
A player's tier, from Iron to Challenger.
_Avoid_: Elo, league

**Division**:
The step inside a tier, from IV up to I.
_Avoid_: Rank (for the division alone)

**Season**:
The current ranked season in League, the span a profile's season stats cover.
_Avoid_: Year

**LP graph**:
The chart on a profile of a player's rank and League Points over time.
_Avoid_: Rank history, ladder chart

**This is me**:
The mark a signed-in person puts on their own profile, so Turnpoint knows which player they are.
_Avoid_: Claim, verify, my account

**Pinned**:
The players a person chose to keep in their saved list.
_Avoid_: Favorites, starred

**Recent**:
The players a person looked up lately, kept in their saved list.
_Avoid_: History

### Games

**Game**:
One played game of League, from champion select to the Nexus falling.
_Avoid_: Match, except in the Matches tab, Match analysis, and Riot names like `matchId`

**Analyzable game**:
A game Turnpoint can analyze: a 5v5 game on Summoner's Rift that lasted long enough.
_Avoid_: Valid game, supported game

**Lane opponent**:
The enemy player in your position in a game.
_Avoid_: Opponent (on its own), enemy laner

**Matchup**:
The comparison between you and your lane opponent in one game.
_Avoid_: Lane matchup, duel

**Matchup verdict**:
Whether you won the matchup, lost it, or came out even.
_Avoid_: Lane result

**Lead**:
How far ahead of your lane opponent you are in gold or another stat; being behind is a negative lead.
_Avoid_: Diff, gap, difference

**Lead chart**:
The chart of your lead over your lane opponent across a game.
_Avoid_: Difference curve, diff graph

**Phase**:
The early, mid or late part of a game.
_Avoid_: Stage, period

**Phase rating**:
How you did in one phase of a game, shown under Game by phase.
_Avoid_: Phase score, phase grade

**Early**:
During the early phase. A label that means a different cutoff names its own clock time instead.
_Avoid_: Using "early" for any other cutoff

**Turning point**:
A big gold swing between you and your lane opponent, numbered on the game page.
_Avoid_: Swing, moment, key moment

**Win chance**:
Your team's chance of winning the game at a given point.
_Avoid_: Win probability, chance to win

**Swing**:
A big move in your team's win chance, one of the Biggest swings lettered A, B and C.
_Avoid_: Turning point, moment, shift

**Play**:
One fight, epic monster or building in a game, as listed in the replay.
_Avoid_: Event, action, moment

**Win chance added**:
How much a play moved your team's win chance, up or down.
_Avoid_: Swing, impact, value

**Grade**:
The word a play earns from its win chance added: Great, Good, Even, Inaccuracy or Mistake.
_Avoid_: Rating, score

**60-second review**:
The short list of plays you were in that moved your team's win chance the most, each with a question to think over.
_Avoid_: Summary, highlights reel

**Moment**:
One item in the 60-second review.
_Avoid_: Using "moment" for turning points, swings or plays

**Replay**:
The map view that plays a game back from Riot's data, with its plays beside it. It is in beta.
_Avoid_: Video, VOD

**Tempo**:
The time advantage that lets one jungler make the next play while the other has to farm, back or give way. Turnpoint estimates it in beta.
_Avoid_: Initiative, pressure

**Gank**:
A jungler coming to a lane early to get a takedown there.
_Avoid_: Roam (for a jungler), lane visit

**Death label**:
The kind of death Turnpoint gives each of your deaths, such as Solo killed, Ganked or Caught out.
_Avoid_: Death type, death reason

**Early death**:
A death during the early phase.
_Avoid_: Early-game death, feed

**Game score**:
A rating of how well each of the ten players played a game.
_Avoid_: Performance score, OP score, rating

**MVP**:
The game score award for the best player on the winning team.
_Avoid_: Badge, best player

**ACE**:
The game score award for the best player on the losing team.
_Avoid_: Badge, best loser

**Highlight**:
A feat in one game, like a Double kill, shown on that game's row.
_Avoid_: Badge, achievement

**Game recap**:
The written summary of one game that Claude produces.
_Avoid_: Recap (on its own), AI recap, summary

**Death recap**:
Riot's breakdown of what killed you in one death.
_Avoid_: Recap (on its own), death summary

### Insights

**Insights**:
The profile tab that looks across many of a player's games for patterns.
_Avoid_: Stats, trends page

**Habit**:
Something a player tends to do in their games, such as Level 6 first or Lane takedown before 6:00.
_Avoid_: Tendency, pattern

**Recurring weakness**:
A pattern that keeps showing up in a player's recent games and costs them.
_Avoid_: Problem, mistake, leak

**Skill to improve**:
The one stat or habit where a player trails players at their rank the most.
_Avoid_: Focus, focus goal

**Benchmark games**:
Games from players at each rank that Turnpoint collects to compare a player against, as in "You vs Gold".
_Avoid_: Reference games, sample games

**Session block**:
A run of games a player played back to back.
_Avoid_: Session (on its own), streak

**Ask**:
The profile tab where a signed-in player asks Claude questions about their games.
_Avoid_: Chat, assistant, AI coach

### Your notes

**Focus goal**:
The one recurring weakness a player picked to track game by game.
_Avoid_: Focus (for the skill to improve), target

**Log**:
The profile tab with a calendar of a player's days and the notes they kept.
_Avoid_: Journal, diary

**Day note**:
A note a player writes about one day of games in the Log.
_Avoid_: Journal entry, daily note

**Game note**:
A note a player writes about one game, under Your notes on the game page.
_Avoid_: Match note, comment
