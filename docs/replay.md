# Replay (beta)

The replay plays a whole game back second by second. Drag along its timeline or press play, and the map shows where every champion was at that moment, and the scoreboard beside it every player's level, kills, deaths, assists, CS, gold and items, with each team's kills, gold, towers and epic monsters. It's on the match page of every game, after the jungle sections and before the win chance graph, marked **Beta**. When you played jungle, it also has the [tempo strip](tempo.md).

The code is in [`src/lib/analyzer/replay.ts`](../src/lib/analyzer/replay.ts) (the map and scoreboard at any second), [`src/lib/analyzer/items.ts`](../src/lib/analyzer/items.ts) (each player's items) and [`src/lib/analyzer/positions.ts`](../src/lib/analyzer/positions.ts) (each champion's spot on the map). The panel is `match/[matchId]/replay.tsx`, with the map in `replay-map.tsx` and the scoreboard in `replay-scoreboard.tsx`.

## What it shows

- **The timeline**: the whole game, with a tick for every kill (blue for your team's, red for the enemy's) and a letter for every epic monster (D dragon, E Elder, G grubs, H Herald, B Baron, A Atakhan). Press or drag anywhere on it, or press play to watch at 10, 30 or 60 times game speed. The arrow buttons jump to the previous or next kill (for junglers, change of tempo). From the keyboard it works like a slider: the arrow keys move 5 seconds, Page Up and Page Down a minute.
- **The map**: all ten champions, in blue for your team and red for the enemy's. Your ring is thicker and your opponent's dashed, like the scoreboard's outlines. A dead champion stays faded where they died, with the time until they're back, and a cross marks each kill for 10 seconds. It sits beside the scoreboard when both fit, and above it otherwise.
- **The moment you're on**: the game clock, how far ahead or behind your team was in gold, and the kill score.
- **Both teams**: your team first, each in role order, with the winning team in blue and the losing team in red, like the scoreboard at the bottom of the page. Your row has a solid outline and your opponent's a dashed one. A dead player's picture is faded, with how long until they're back. On phones each team is a list instead of a table, so nothing has to scroll sideways while you drag the timeline.

## Where each number comes from

Riot's match timeline has two kinds of data: events, each logged with its exact time, and a snapshot of every player once a minute.

| Number | Where it comes from |
|---|---|
| Kills, deaths, assists | Kill events, so exact to the second. |
| Dead, back in | The time of the death, plus the game's death timer: a base time for the level, plus up to 50% more as the game goes on. About 1 in 10 deaths ends sooner than the timer says (see [tempo.md](tempo.md#death-timers)). |
| Level | Each level gives one skill point, and Riot logs each one to the second. Points can be spent a little late, so the count is kept between the levels in the snapshots either side. |
| CS and gold | Only in the once-a-minute snapshots. Between two snapshots, they're read off a straight line from one to the next, so they're estimates. Gold is all the gold earned so far, spent or not. |
| Towers, inhibitors, epic monsters | Their events, so exact. |
| Items | Rebuilt from the item events. See below. |
| Spot on the map | Riot's snapshots, plus the spots of deaths, kills and epic monsters and the fountain at shop visits, joined up. Exact at the snapshots, deaths and fountain visits, estimates in between. See below. |

`replayData` runs on the server and keeps only what the map and scoreboard need, so the page sends a few dozen KB instead of the whole timeline. `scoreboardAt` runs in the browser every time the clock moves.

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
5. **Leaving the fountain**, they walk straight to the next spot at 400 units a second, about a champion's speed with boots, and wait there. Players head straight back out after shopping, so spreading the walk over the whole time until the next snapshot would leave them dawdling near the fountain.

Between those spots, a champion moves in a straight line. The map is about 14,900 units across, and a lane about 800 wide.

### How close it gets

The only positions known for certain are Riot's snapshots, so the check leaves out one snapshot at a time, works out that moment from everything else, and measures how far the estimate is from Riot's spot. It adds each kind of spot in turn. On one ranked game so far (28 minutes, 280 snapshots left out):

| Built from | Median miss | 90% of misses within | Within 2,000 |
|---|---|---|---|
| Snapshots only | 3,511 | 7,080 | 25.4% |
| + deaths | 3,138 | 7,389 | 32.9% |
| + the fountain at shop visits | 3,511 | 8,089 | 30.4% |
| + walking straight out of the fountain | 2,434 | 7,384 | 42.9% |
| + kills they took part in | 1,947 | 6,145 | 50.4% |
| + epic monsters | 1,841 | 5,614 | 51.8% |
| + leaving out what they couldn't reach | 1,827 | 5,614 | 52.1% |

- Shop visits only helped once champions walked straight back out. Spread over the time until the next snapshot, the walk left them near the fountain while Riot had them back in lane.
- Walking speeds from 300 to 500 units a second came within 250 units of each other. The replay uses 400.
- Junglers are the hardest to place (median miss 2,772) and top laners the easiest (1,362).
- Of 149 shop events, 4 were followed by a snapshot too far from the fountain to have walked to: three were Ornn's, which is why his purchases don't count.

With one snapshot left out, the estimate spans two minutes, while the replay's never spans more than one, so the replay is closer than this.

## Limits

- The order of items in the six slots is a guess: Riot doesn't log slots, so each item goes in the first empty one. Which items a player has is what the check tests.
- Gold and CS between snapshots are estimates, so they can be off by a few hundred gold or a few CS in the middle of a minute.
- An item that changes with no event and isn't in the final items can't be seen.
- A dead player can come back a little sooner than "back in" says (see the death timer row above).
- Between snapshots, positions are estimates. Riot doesn't log walls, teleports or detours, so a champion can walk through a wall, or across the map after a teleport. In a fight, champions on the same spot overlap.

## Running the checks

```sh
npm run tempo-games -- --items --players 3 --games 5   # downloads games into .cache/item-check (needs RIOT_API_KEY)
npm run check-items                                    # the item check; makes no Riot calls
npm run check-positions                                # the position check, on the same games
```

On Windows PowerShell, use `npm.cmd` when passing options after `--`.

The downloader is the tempo study's (docs/tempo.md), on the Oceania server by default. With `--items` it keeps each game's whole timeline and every player's champion, role and final items, without names or PUUIDs. Git ignores the folder and nothing goes in the database.

The item check's report starts with how many players' items matched, then lists every kind of miss with the item events behind a couple of examples, which is where a new rule comes from. It's in [`src/lib/analyzer/item-check.ts`](../src/lib/analyzer/item-check.ts) and [`scripts/check-items.ts`](../scripts/check-items.ts). Run it again after a patch that adds items that transform or arrive for free, and add a rule to `items.ts` (with a test) for anything new it finds.

The position check's report has the table above, the same by role, and the numbers behind the rules: where dead champions are, shop visits away from the fountain, and how far killers, helpers and monster takers were from the spot. It's in [`src/lib/analyzer/position-check.ts`](../src/lib/analyzer/position-check.ts) and [`scripts/check-positions.ts`](../scripts/check-positions.ts).
