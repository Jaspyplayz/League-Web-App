# Replay (beta)

The replay plays a whole game back second by second. Drag along its timeline or press play, and the scoreboard under it shows every player's level, kills, deaths, assists, CS, gold and items at that moment, with each team's kills, gold, towers and epic monsters. It's on the match page of every game, after the jungle sections and before the win chance graph, marked **Beta**. When you played jungle, it also has the [tempo strip](tempo.md).

The code is in [`src/lib/analyzer/replay.ts`](../src/lib/analyzer/replay.ts) (the scoreboard at any second) and [`src/lib/analyzer/items.ts`](../src/lib/analyzer/items.ts) (each player's items). The panel is `match/[matchId]/replay.tsx`, with the scoreboard in `replay-scoreboard.tsx`.

## What it shows

- **The timeline**: the whole game, with a tick for every kill (blue for your team's, red for the enemy's) and a letter for every epic monster (D dragon, E Elder, G grubs, H Herald, B Baron, A Atakhan). Press or drag anywhere on it, or press play to watch at 10, 30 or 60 times game speed. The arrow buttons jump to the previous or next kill (for junglers, change of tempo). From the keyboard it works like a slider: the arrow keys move 5 seconds, Page Up and Page Down a minute.
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

`replayData` runs on the server and keeps only what the scoreboard needs, so the page sends a few dozen KB instead of the whole timeline. `scoreboardAt` runs in the browser every time the clock moves.

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

The check plays each game's events to the end and compares the result with the items Riot lists for every player after the game (`item0` to `item5`, and `item6` for the trinket). Slots don't count, since Riot doesn't log them.

RESULTS_PLACEHOLDER

### Games saved before items were kept

Turnpoint started keeping item sales and used-up items in saved timelines with this feature. When the match page opens a game saved before that, it fetches the timeline from Riot once more and saves the new copy. If Riot can't be reached, the replay shows everything but the items and says why.

## Limits

- The order of items in the six slots is a guess: Riot doesn't log slots, so each item goes in the first empty one. Which items a player has is what the check tests.
- Gold and CS between snapshots are estimates, so they can be off by a few hundred gold or a few CS in the middle of a minute.
- An item that changes with no event and isn't in the final items can't be seen.
- A dead player can come back a little sooner than "back in" says (see the death timer row above).

## Running the item check

```sh
npm run tempo-games -- --items --players 3 --games 5   # downloads games into .cache/item-check (needs RIOT_API_KEY)
npm run check-items                                    # the report; makes no Riot calls
```

On Windows PowerShell, use `npm.cmd` when passing options after `--`.

The downloader is the tempo study's (docs/tempo.md), on the Oceania server by default. With `--items` it keeps each game's whole timeline and every player's champion, role and final items, without names or PUUIDs. Git ignores the folder and nothing goes in the database. The report starts with how many players' items matched, then lists every kind of miss with the item events behind a couple of examples, which is where a new rule comes from. The check is in [`src/lib/analyzer/item-check.ts`](../src/lib/analyzer/item-check.ts) and [`scripts/check-items.ts`](../scripts/check-items.ts).

Run it again after a patch that adds items that transform or arrive for free, and add a rule to `items.ts` (with a test) for anything new it finds.
