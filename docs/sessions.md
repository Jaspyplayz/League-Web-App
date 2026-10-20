# Session blocks

Do you play better in short blocks of games, and do long blocks go with a lower win rate or game score? The **Session blocks** section of Insights answers that from the games already on the page. It needs no timelines, no database changes and no API calls beyond the match list Insights already loads.

Like [Habits](habits.md), it describes a pattern and never grades it: the numbers aren't colored blue or red, and nothing tells you to stop playing. Later games going worse isn't always tiredness, since a losing streak is also what keeps people queuing.

## What a block is

A block (a session) is games played back to back: less than 30 minutes (`SESSION_GAP_MS`) between one game ending and the next one starting. That covers champion select, a dodge or a short break, but not dinner.

Every game that loaded counts toward the blocks, ARAM, Arena and other champions included, because they're about when you played: leaving an ARAM out would split one evening into two blocks. Only games with a [game score](game-score.md) are counted in the numbers (Summoner's Rift games with roles, 10 minutes or longer, no remakes), so the win rate and the average score are always about the same games. A champion picked in the filter bar doesn't narrow this section, and the section says so.

## What it shows

The code is `analyzeSessions` in [`src/lib/analyzer/sessions.ts`](../src/lib/analyzer/sessions.ts), shown by [`insights/session-blocks.tsx`](../src/app/player/%5Bregion%5D/%5BriotId%5D/insights/session-blocks.tsx).

- **The headline**: your 4th game onward in a block (`LATER_FROM`) against games 1 to 3, as the difference in average game score and the two win rates. "About 3 games" is the question the section was built for, so that's where it splits.
- **By block length**: blocks of 1 to 2, 3, 4 to 5 and 6 or more games, with how many blocks, scored games, the win rate and the average score. A block's length counts its unscored games too, since they were still played.
- **By game in the block**: the 1st game of a block, the 2nd, and so on up to "6th game on", for as many as your longest block had.

Groups with fewer than 10 games (`FEW_GAMES`) are marked with a star, and the headline says when either side is that small: a couple of results either way could swing them.

## Limits

- The games are the last 20, 50 or 100 on the page, so the oldest block may have started before the window. Its first games then count as the block's 1st and 2nd when they were really later ones.
- Game score is a rank among players of the same role (73 means better than 73% of junglers in our games), so an average across roles mixes scales a little. Most players stick to one or two roles.
