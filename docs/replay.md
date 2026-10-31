# Replay (beta)

The replay plays a whole game back second by second. Drag along its timeline or press play, and the map shows where every champion was at that moment, and the scoreboard beside it every player's level, kills, deaths, assists, CS, gold and items, with each team's kills, gold, towers and epic monsters. The timeline also shows your team's chance to win at every second, and beside the map every play of the game is graded by how much it moved that chance. What the colors, dots and letters mean is behind the **How to read this** button at the top. It's on the Deep dive tab of every game's match page, marked **Beta**. When you played jungle, it also has the [tempo strip](tempo.md).

The code is in [`src/lib/analyzer/replay.ts`](../src/lib/analyzer/replay.ts) (the map and scoreboard at any second), [`src/lib/analyzer/items.ts`](../src/lib/analyzer/items.ts) (each player's items), [`src/lib/analyzer/positions.ts`](../src/lib/analyzer/positions.ts) (each champion's spot on the map) and [`src/lib/analyzer/plays.ts`](../src/lib/analyzer/plays.ts) (the chance to win at every second, and the plays). The panel is `match/[matchId]/replay.tsx`, with the map in `replay-map.tsx` (Summoner's Rift itself in `map-background.tsx`), the scoreboard in `replay-scoreboard.tsx` and the plays in `replay-plays.tsx`.

## What it shows

- **The timeline**: the whole game. On top, your team's chance to win at every second (blue above even, red below), then a dot for every play (blue when it raised your team's chance, red when it lowered it, grey when it barely moved it, bigger the more it moved), a letter for every epic monster (D dragon, E Elder, G grubs, H Herald, B Baron, A Atakhan) and a tick for every kill (blue for your team's, red for the enemy's). Press or drag anywhere on it to move there. From the keyboard it works like a slider: the arrow keys move 5 seconds, Page Up and Page Down a minute.
- **The map**: Riot's own minimap picture of Summoner's Rift, with all ten champions on it, in blue for your team and red for the enemy's. Your ring is thicker and your opponent's dashed, like the scoreboard's outlines. A dead champion stays faded where they died, with the time until they're back, and a cross marks each kill for 10 seconds. It sits beside the plays list when both fit, and above it otherwise, with the scoreboard across the whole width under them. (In games without plays, it sits beside the scoreboard.)
- **The play bar**, right under the timeline: the play button (10, 30 or 60 times game speed), arrow buttons that jump to the previous or next play, the game clock, the play the replay is on with its grade ("Play 4 of 14"), and your team's chance to win at that second. Under it, what happened in that play: each kill and objective, the chance before and after, and, for junglers, who had tempo just before.
- **The moment you're on**: above the scoreboard, the game clock, how far ahead or behind your team was in gold, and the kill score.
- **Both teams**: your team first, each in role order, with the winning team in blue and the losing team in red, like the scoreboard at the bottom of the page. Your row has a solid outline and your opponent's a dashed one. A dead player's picture is faded, with how long until they're back. On phones each team is a list instead of a table, so nothing has to scroll sideways while you drag the timeline.
- **Plays**: every fight, epic monster, tower and inhibitor, with a grade: how much it changed your team's chance to win. Pick one to jump the replay to it, and the play bar shows what happened. The play the replay is on is highlighted, and the list scrolls to keep it in sight while the game plays. **Yours** shows only the plays you took part in, and the line above the list counts your grades. See [how the plays are graded](#how-the-plays-are-graded).

## Where each number comes from

Riot's match timeline has two kinds of data: events, each logged with its exact time, and a snapshot of every player once a minute.

| Number | Where it comes from |
|---|---|
| Kills, deaths, assists | Kill events, so exact to the second. |
| Dead, back in | The time of the death, plus the game's death timer: a base time for the level, plus up to 50% more as the game goes on. About 1 in 10 deaths ends sooner than the timer says (see [tempo.md](tempo.md#death-timers)). |
| Level | Each level gives one skill point, and Riot logs each one to the second. Points can be spent a little late, so the count is kept between the levels in the snapshots either side. |
| CS | Only in the once-a-minute snapshots. Between two snapshots, it's read off a straight line from one to the next, so it's an estimate. |
| Gold | Only in the once-a-minute snapshots too: all the gold earned so far, spent or not. Between two snapshots, a kill's gold arrives at the second of the kill, and the rest of the minute's gold at a steady pace. Riot doesn't log what each kill paid, so each counts the base reward, 300 for the killer and 150 shared by the helpers, scaled down if the minute paid less than that. At each snapshot it's exact again. |
| Chance to win | The [win chance](win-chance.md) model, read at that second: kills, towers and epic monsters from their events, gold and XP from the estimates. At each minute mark it's the same as the Win chance graph. |
| Towers, inhibitors, epic monsters | Their events, so exact. |
| Items | Rebuilt from the item events. See below. |
| Spot on the map | Riot's snapshots, plus the spots of deaths, kills and epic monsters and the fountain at shop visits, joined up. Exact at the snapshots, deaths and fountain visits, estimates in between. See below. |

`replayData` runs on the server and keeps only what the map and scoreboard need, so the page sends a few dozen KB instead of the whole timeline. `scoreboardAt` runs in the browser every time the clock moves. `replayChances` runs on the server too and sends the chance at every second (about 7 KB for a 30-minute game) and the graded plays, not the model.

## How items are rebuilt

Riot logs four kinds of item event, each with the item and the exact time: bought, sold, a purchase or sale undone, and "destroyed", which means the item left the inventory any other way. Riot doesn't log which slot an item went in, or anything about items that change by themselves. `itemHistory` plays the events back in order with these rules:

1. **Bought**: into the first empty slot. Potions, control wards and biscuits stack.
2. **Sold**: out of the inventory.
3. **Destroyed at the same moment as a purchase**: a component used up building the new item. Undoing the purchase brings the components back, even though Riot doesn't log them returning.
4. **Destroyed on its own**: used up, like a potion drunk or a control ward placed. Elixirs are logged as destroyed and bought at the same millisecond, sometimes in that order, so an item destroyed before it's there is tried again after the purchase.
5. **Items that turn into another one**: tier 2 boots become tier 3, the support item goes World Atlas, Runic Compass, Bounty of Worlds and then an upgrade, Seeker's Armguard shatters once its stasis is used, and items built from a Tear of the Goddess (Manamune, Archangel's Staff, Winter's Approach, the support item that becomes Diadem of Songs) transform once it's charged. Riot logs only the old item being destroyed, with nothing bought at that moment except maybe potions, control wards or elixirs, so the rebuild swaps it for the new one in the same slot. An item can turn as it's bought, like boots bought after the mid lane quest. Bounty of Worlds becomes the next upgrade the player's events mention (selling it, say), or else the one in their final items, since a support can sell their upgrade and buy the support item again to pick another.
6. **Free items** are never logged arriving:
   - Everyone starts with a Stealth Ward (Fiddlesticks with his Scarecrow Effigy). Riot logs it only when it leaves or the player buys a trinket. A player with no trinket events keeps the one Riot lists at the end, all game.
   - Supports start with World Atlas.
   - The Magical Footwear rune gives boots by 12:00, and the Biscuit Delivery rune a biscuit at 2, 4 and 6 minutes (to anyone Riot logs eating one, or lists with one at the end). When all six slots are full, they wait for one to empty.
7. **Eye of the Herald**: picking it up takes the trinket slot, which Riot logs as the trinket being destroyed with no trinket bought. The trinket comes back when the Eye is used.
8. **The role quest's slot**: each role's quest is tracked with a hidden item that's never bought (1200 to 1209, and 1220 and 1221 for top lane), kept in a slot of the role's own. Riot logs the hidden item leaving whenever something else goes in that slot. For a bot laner, that's their boots once the quest is done, which frees one of the six. For a support, it's every control ward they buy, all game, logged as bought and destroyed at once. A ward still in the slot when their quest is done is destroyed with the hidden item. A jungler's pet leaves their items when the quest is done, logged the same way. The scoreboard draws that slot between the six and the trinket.
9. **Undoing** takes back the latest purchase or sale. Riot logs an undone purchase as the item before and nothing after. An undone sale, and an undone purchase that replaced another item (a trinket swap, picking the support item's upgrade), are both logged as nothing before and the item after, so the rebuild undoes whichever of the two happened last. When the item bought has already turned into another (boots upgraded by the mid lane quest) or moved (a support's control ward), Riot names nothing, and the rebuild undoes the latest purchase or sale, whatever it was.
10. **Viego**: possessing an enemy logs every item he holds as destroyed, and going back to himself logs every item the enemy held as destroyed. For Viego, several items destroyed at once with nothing bought is never a real change, so the rebuild skips it, except for his quest's hidden item leaving with one other item, which is his pet evolving. While he's possessing someone, the scoreboard shows his own items.
11. **Anything else**: destroying an item the player doesn't have changes nothing.

### How well it matches

The check plays each game's events to the end and compares the result with the items Riot lists for every player after the game (`item0` to `item5`, `item6` for the trinket, and `roleBoundItem` for the role quest's slot). Slots don't count, since Riot doesn't log them.

On 137 ranked solo games from the Oceania server, Iron to Challenger, downloaded on October 17, 2026 (patch 16.20):

| | Players right |
|---|---|
| All six items | 1,370 of 1,370 (100%) |
| Trinket | 1,370 of 1,370 (100%) |
| Role quest's slot, for the 403 players with an item in it | 403 of 403 (100%) |

It took six rounds. With only the plain rules (1 to 4), 48.1% of players' six items were right. Each round added rules for what the one before missed: 94.2%, then 98.4%, then 100%. The last two rounds fixed things the end of the game doesn't show: three players held a seventh item for a while, and one support's role quest slot was off.

The check only sees the end of each game. In between, the sign that the rebuild missed something is a player holding more than six items, which the report lists; no one does now.

### Games saved before items were kept

Turnpoint started keeping item sales and used-up items in saved timelines with this feature. When the match page opens a game saved before that, it fetches the timeline from Riot once more and saves the new copy. If Riot can't be reached, the replay shows everything but the items and says why.

## How the map is worked out

Riot's timeline has every champion's position once a minute. Between two snapshots, some events say where a champion was, or must have been. `positionPath` puts them in order for each champion and joins them up:

1. **Snapshots**: where Riot says they were, every minute.
2. **Deaths**: the spot Riot logs with the kill. The champion stays there, faded, until they're back. That's also where Riot's snapshots put a dead champion: in the check below, every snapshot taken while someone was dead had them exactly at the spot they died.
3. **The fountain**, when they come back after a death, and whenever they buy, sell or undo in the shop, which only works at the fountain (or while dead, which doesn't count). Recalling takes them there at once, so it's a jump: they stay where they were until the moment they're at the fountain. Ornn can buy items anywhere, so his purchases don't count.
4. **Kills they got or helped with**, at the kill's spot, and **epic monsters they took**, at the monster's pit, since Riot doesn't log where a monster died. Atakhan is left out, because he can spawn in either of two pits. An assist can come from a heal or shield far away, and some ultimates cross the map, so a kill or monster is left out when they couldn't have got there in time from the spot before it, or from there to the spot after it: at 500 units a second, plus 1,500 for a dash, a Flash or an ability's range.
5. **Leaving the fountain**, they walk to the next spot at 400 units a second, about a champion's speed with boots, and wait there. Players head straight back out after shopping, so spreading the walk over the whole time until the next snapshot would leave them dawdling near the fountain.

Between those spots, a champion takes the shortest walk around the Rift's walls, at a steady pace. The map is about 14,900 units across, and a lane about 800 wide.

### The Rift's walls

Riot doesn't publish where Summoner's Rift's walls are, but its snapshots never put a champion inside one. So `npm run rift-map` ([`scripts/rift-map.ts`](../scripts/rift-map.ts)) counts where every snapshot and kill fell, in squares of 100 by 100 map units, across the games saved for the tempo study and the item check: 736,862 positions in 1,987 games from patches 16.1 to 16.20, most of them 16.20. A square where at least 3 positions fell is ground, and the rest is wall. Then two clean-ups: a patch of wall smaller than 6 squares with ground all around is just somewhere nobody happened to stand, and a patch of ground that small, cut off from the rest, is champions caught inside a wall mid-dash, or Kayn walking through one. That leaves 14,607 of the 22,500 squares as ground. The walls, and their outline for drawing, are saved in [`rift-map.json`](../src/lib/analyzer/rift-map.json), and the code is in [`rift.ts`](../src/lib/analyzer/rift.ts).

The map on the page is Riot's minimap picture of the Rift, from Data Dragon like the champion pictures, with the learned walls drawn underneath in the same colors. The drawing shows while the picture loads, or on its own when Data Dragon can't be reached. With the picture moved and scaled until its walls lined up best with the learned ones, the two match closely all over the map. The learned walls sit a little inside the picture's, since a champion's position is its middle, which stops short of the wall.

`walkingRoute` finds the way around: the shortest path over the squares, pulled tight so it only turns at corners. A champion walks it at a steady pace between two spots. When it's too long to walk in the time at 500 units a second, they must have gone over the wall, with a dash, a Flash or a jump, so they go straight. Walking out of the fountain, the time to the next spot counts the way around too.

### How close it gets

The only positions known for certain are Riot's snapshots, so the check leaves out one snapshot at a time, works out that moment from everything else, and measures how far the estimate is from Riot's spot. It adds each kind of spot in turn. On the same 137 games as the item check (1,370 players, 40,500 snapshots left out), in map units, with the map about 14,900 across and a lane about 800 wide:

| Built from | Median miss | 90% of misses within | Within 2,000 |
|---|---|---|---|
| Snapshots only | 3,639 | 7,780 | 27.6% |
| + deaths | 2,970 | 7,448 | 39.1% |
| + the fountain at shop visits | 3,204 | 7,810 | 37.9% |
| + walking straight out of the fountain | 1,846 | 7,033 | 52.6% |
| + kills they took part in | 1,485 | 5,496 | 60.8% |
| + epic monsters | 1,433 | 5,269 | 62.1% |
| + leaving out what they couldn't reach | 1,437 | 5,294 | 62.0% |
| + walking around walls | 1,439 | 5,305 | 62.0% |

- Shop visits only helped once champions walked straight back out. Spread over the time until the next snapshot, the walk left them near the fountain while Riot had them back in lane.
- Walking speeds from 350 to 500 units a second came within 170 units of each other, and 300 was 260 further off. The replay uses 400, 50 units behind the best (450).
- Leaving out kills and monsters a champion couldn't have reached made no difference over 137 games. It helped a little on the first game the check ran on, and it's kept because it stops the odd champion crossing the map for a kill they weren't near.
- Walking around walls made no difference to how close it gets: the median miss went from 1,437 to 1,439. A champion's real path between two spots isn't the shortest one either. It's there so champions stop walking through walls on the map.
- By role, the median miss was 1,239 for mid laners, 1,280 for top, 1,297 for bottom, 1,441 for supports and 2,058 for junglers, who move between camps with nothing logged on the way. Walking around walls took junglers' from 2,014 to 2,058, since the shortest way hugs the walls while junglers cut through their camps.
- 5,169 of the 5,286 snapshots taken while a champion was dead (by the death timer) had them exactly where they died. The other 117 were back sooner (see the death timer row above).
- Killers were a median of 568 units from the kill's spot in snapshots within 3 seconds of it, helpers 767, and players who took an epic monster 680 from its pit, which is why those spots count.
- Of 22,866 shop visits by living champions, 318 (1.4%) were followed by a snapshot too far from the fountain to have walked to. They were spread over many champions (Yone had the most, 15), so only Ornn's purchases, which he can make anywhere, are skipped.
- All ten paths come to a median of 45 KB per game, 74 KB at most. Each turn around a wall adds a point, so that's up from 27 KB before champions walked around walls.

With one snapshot left out, the estimate spans two minutes, while the replay's never spans more than one, so the replay is closer than this.

## How the plays are graded

A play is a run of kills, epic monsters, towers and inhibitors less than 20 seconds apart, so a fight at Baron and the tower right after it are one play. Its grade is your team's chance to win just after its last event minus just before its first, in points: from 52.0% to 59.6% is +7.6. Plays never overlap, so between them only gold and XP move the chance (farming, plates and passive gold), plus a buff running out or an inhibitor coming back.

The grades borrow chess.com's game review scale, which ranks moves from Brilliant to Blunder ([decision record 0023](adr/0023-chess-style-grades.md)):

| Grade | Your team's chance moved by | And |
|---|---|---|
| Brilliant | +4 points or more | Your team won one of its fights with at least 2 fewer champions in it than the enemy |
| Great | +8 or more | It moved your team up at least a step: from losing to even or winning, or from even to winning |
| Excellent | +4 or more | Any other gain this big |
| Good | +1 to +4 | |
| Even | less than 1 either way | |
| Inaccuracy | −1 to −4 | |
| Mistake | −4 or more | Any loss this big that isn't a Blunder |
| Blunder | −8 or more | It moved your team down at least a step: from winning to even or losing, or from even to losing |

Losing means a chance under 40%, winning over 60%, and even in between, 40% and 60% included, read to a tenth of a percent as the page shows it. Great and Blunder mark the plays that changed who was ahead, not just by how much; the 8 points keep an early lone kill that tips the chance from 43% to 39% from reading as a Blunder.

Brilliant is the outnumbered win. A play's kills are split into fights wherever two are 10 seconds or more apart, so three pickoffs 15 seconds apart are three 1 against 1 fights, not one 1 against 3. A champion is in a fight when they killed, helped or died in it, and Riot counts anyone who did damage to the victim as a helper. Your team needs at least one champion in it, so enemies dying to a tower don't count. One fewer isn't enough, because the losing side of a big fight nearly always shows all five, so a 4 against 5 is usually a teammate who stayed out of it. Brilliant ranks first, so a play that's both outnumbered and game-turning reads Brilliant.

Chess.com's Best, Miss and Book are left out on purpose. Best needs the other options a player had, which a chess engine works out and Turnpoint can't: it only measures what a play did. Miss is a slip the enemy made that your team didn't punish, which is the absence of a play, and the win chance only grades plays that happened. Book is a standard opening move, and the opening habits a League game has (level 6 first, first scuttles, first back) aren't kills, epic monsters or buildings, so they aren't plays here.

It grades what a play did to the game, not whether it was the right call: a fight you didn't join still moves your team's chance, and so does the enemy taking Dragon. It's called "Win Probability Added" in sports.

Things that shape the grades:

- **A kill counts through its gold.** The model learned that a kill on its own is worth almost nothing, because the gold it pays is already in the gold lead (see [win-chance.md](win-chance.md#the-weights-it-learned)). So a kill's grade comes from the base reward arriving at the second of the kill. In an even game that's 2.8 points for a solo kill at 5:00 and 4.1 with a helper, falling to 2.0 and 3.0 by 20:00, because the model counts a gold lead for less as builds fill up. The extra gold of a shutdown arrives spread over the minute, so the play doesn't count it.
- **Towers and Baron count mostly through their gold.** The model learned that a tower is worth the gold it pays, and Riot doesn't log tower gold, so it reaches the replay spread over the rest of the minute: a tower on its own reads Even. Baron's buff adds about a point at once, and its gold arrives the same way. Dragons, Elder and inhibitors count in full at the second they're taken.
- **The same play is worth less once a game is decided.** In a 28-minute Qiyana game of Jasper's, a fight won 6 for 3 with two towers added 0.2 points, because the team was already at 99%. That's how win probability works in any sport: the plays that decide a game happen while it's close.

In the golden comeback game (`src/lib/analyzer/fixtures/comeback.json`), the 14 plays the blue jungler was in came out as 2 Great, 5 Excellent, 3 Good, 1 Even, 1 Inaccuracy and 2 Mistake. The first Great was a fight won 5 for 1 with Baron and two towers at 25:10, which took the team from 23.6% to 60.8% (+37.1). The red jungler was in the same fight, and from their side it's a Blunder: 76.4% to 39.2%. None of the golden games has a Brilliant, which is meant to be rare, as it is in chess. `golden.test.ts` checks each jungler's grade counts in these games, so a change to the grades, to how plays are grouped or to the model shows there.

## Limits

- The order of items in the six slots is a guess: Riot doesn't log slots, so each item goes in the first empty one. Which items a player has is what the check tests.
- Gold and CS between snapshots are estimates, so they can be off by a few hundred gold or a few CS in the middle of a minute. The chance to win between minute marks is an estimate for the same reason.
- An item that changes with no event and isn't in the final items can't be seen.
- A dead player can come back a little sooner than "back in" says (see the death timer row above).
- Between snapshots, positions are estimates. Riot doesn't log teleports or detours, so a champion can walk across the map after a teleport, and takes the shortest way around a wall even when they went another way. When the way around is too long for the time, they cross the wall, as with a dash or a Flash. In a fight, champions on the same spot overlap.
- The walls champions walk around are learned from this season's games, so after a change to the map they're out of date until `npm run rift-map` runs on games from the new patch.
- Plays are grouped by time only, so two things 15 seconds apart on opposite sides of the map make one play.
- A play's grade uses the base kill gold, so shutdowns and first blood count for less than they paid, and kills on players who keep dying for more.
- Brilliant counts the champions in a fight from its kills, so an enemy who was there but neither died nor got a kill or assist isn't counted, and a teammate who only stood nearby isn't either. Its fights are kills less than 10 seconds and 3,000 units apart, so a kill with no position counts as a fight on its own.

## Running the checks

```sh
npm run tempo-games -- --items --players 3 --games 5   # downloads games into .cache/item-check (needs RIOT_API_KEY)
npm run check-items                                    # the item check; makes no Riot calls
npm run check-positions                                # the position check, on the same games
npm run rift-map                                       # the Rift's walls, from every game saved for the checks
```

On Windows PowerShell, use `npm.cmd` when passing options after `--`.

The downloader is the tempo study's (docs/tempo.md), on the Oceania server by default. With `--items` it keeps each game's whole timeline and every player's champion, role and final items, without names or PUUIDs. Git ignores the folder and nothing goes in the database.

The item check's report starts with how many players' items matched, then lists every kind of miss with the item events behind a couple of examples, which is where a new rule comes from. It's in [`src/lib/analyzer/item-check.ts`](../src/lib/analyzer/item-check.ts) and [`scripts/check-items.ts`](../scripts/check-items.ts). Run it again after a patch that adds items that transform or arrive for free, and add a rule to `items.ts` (with a test) for anything new it finds.

`rift-map` needs at least 1,000 saved games. It also saves its counts in `.cache/rift-counts.json`, and uses them when no games are saved, so the walls can be redrawn without downloading again.

The position check's report has the table above, the same by role, and the numbers behind the rules: where dead champions are, shop visits away from the fountain, and how far killers, helpers and monster takers were from the spot. It's in [`src/lib/analyzer/position-check.ts`](../src/lib/analyzer/position-check.ts) and [`scripts/check-positions.ts`](../scripts/check-positions.ts).
