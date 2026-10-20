# Death recaps added up

In a game, League shows a death recap for a few seconds after you die: who hit you, with what, for how much. Then it's gone, so you never see that the same Elise cocoon started six of your last nine deaths to her. **What keeps killing you**, on Insights' Overview tab, adds those recaps up across the games on the page, so you know what to respect and what to build against.

It passes Turnpoint's test for a feature because it changes what you do next game: dodge or respect one ability, and buy the resist that covers most of what kills you.

## Where the data comes from

Riot's match timeline gives every `CHAMPION_KILL` event a `victimDamageReceived` list: the damage the victim took in the last seconds before dying, one line per source and spell. Each line has the source's `participantId` (0 for towers, minions and monsters), a `type` (`OTHER` for champions, or `TOWER`, `MINION`, `MONSTER`), whether it was a `basic` attack, a `spellSlot` and `spellName`, and the physical, magic and true damage. It's the same data as the in-game recap, from Riot's official API.

[`trim.ts`](../src/lib/analyzer/trim.ts) keeps that list on each kill, minus Riot's `name` (participantId already says who it was). It's an optional field, not a new `TRIM_VERSION`: a new version would make every saved timeline download again, all against the same Riot rate limit. So the card fills in from timelines saved since October 2026, and says how many deaths it left out because their game was saved before. A new trim always has the list, even when Riot left it out because it was empty, so a missing list always means an old timeline.

Crowd control isn't in the data, so a stun that set up a death only shows if it also did damage.

## How it's added up

The code is [`src/lib/analyzer/death-recap.ts`](../src/lib/analyzer/death-recap.ts), with tests next to it, shown by [`insights/death-recap.tsx`](../src/app/player/%5Bregion%5D/%5BriotId%5D/insights/death-recap.tsx).

1. **Each game** (`findGameDeaths`): your deaths, each with the enemy champions' hits. Each hit is one champion and one ability: Q, W, E or R by `spellSlot` 0 to 3, basic attacks, a summoner spell (`spellName` starting with "Summoner", which tells Ignite from the rest), or "other" for passives, items and runes. Two lines for the same ability in one death are added together. Towers only count as "a tower was hitting you".
2. **Across games** (`addUpDeaths`): for each enemy champion, how many of your deaths they did damage in, their share of all the champion damage, and their abilities in the most deaths first. Champions are matched by name, so Syndra in one game and Syndra in another add up.
3. **What to respect**: the Q, W, E or R that hit you in the most of your deaths to its champion, in at least two. Basic attacks, summoner spells and passives are left out of this line, because "respect Kai'Sa's basic attacks" doesn't say what to look out for.
4. **What the damage was**: physical, magic and true as shares of all the champion damage. When one kind is 60% or more, the card says which resist covers the most of it.

The card waits for 3 deaths with a recap (`MIN_RECAP_DEATHS`) and shows the 3 champions in the most deaths. The champion filter applies, like the rest of Overview. Ability names ("Dark Sphere (Q)") come from each champion's own Data Dragon file, fetched only for the champions on the card and cached for days; without Data Dragon the card says "Q".

## Limits

- Only games whose timeline was first saved after this shipped have recaps. Games opened on the match page get them too when the page downloads the timeline again for the replay's items.
- "In 6 of your 9 deaths to Elise" counts deaths Elise did any damage in, not only the ones Elise got the kill in, since a death is usually several champions' damage.
- Riot's `spellSlot` numbering for anything other than Q, W, E and R isn't documented, so those are told apart by `basic` and `spellName` instead.
