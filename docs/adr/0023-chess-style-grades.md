# 0023: Plays are graded on a chess-style scale

Status: draft (JAS-85). Jasper accepts it by merging the PR.

## Context

The replay grades every play (a run of kills, epic monsters and buildings) by Win Probability Added: how much it moved your team's chance to win. Until now it had five grades, set only by the size of the move: Great from +4 points, Good from +1, Even, Inaccuracy from −1, Mistake from −4. The Review board look picked in JAS-77 has a colour and symbol for each of chess.com's game review grades (Brilliant, Great, Best, Excellent, Good, Book, Inaccuracy, Mistake, Miss, Blunder) plus Turnpoint's Even, and Jasper wants plays rated like a chess game review. With five grades, a fight that turned a lost game reads the same as any other gain of 4 points, and a −34 point fight late in a game reads Mistake.

Chess grades a move against an engine's best move. Turnpoint has no engine for League: it only knows what a play did to the chance, and who killed, helped or died in it.

## Options

1. Keep five grades. Honest, but it can't tell a game-turning play from an ordinary gain, and the Review board's other grades would never show.
2. Map all eleven of chess.com's grades onto League. Best and Miss would need the options a player had and didn't take, and Book needs opening moves that aren't plays here, so those three would be guesses dressed up as judgments.
3. Keep the grades that have a sound League meaning from what the analyzer can measure, and leave the rest out on purpose.

## Decision

Option 3, settled with Jasper on the ticket. Eight grades, best first:

| Grade | Rule |
|---|---|
| Brilliant | +4 points or more, and one of its fights (its kills, grouped by time and place: see below) was won (more enemy deaths than yours) with at least one of your champions in it and at least 2 fewer than the enemy's (killers, helpers and victims) |
| Great | +8 or more, and it moved your team up at least a band: losing (under 40%), even (40% to 60%), winning (over 60%), read to a tenth of a percent as the page shows it |
| Excellent | Any other +4 or more |
| Good | +1 to +4 |
| Even | Less than 1 either way |
| Inaccuracy | −1 to −4 |
| Mistake | Any other −4 or more |
| Blunder | −8 or more, and it moved your team down at least a band |

- **Bands, not size alone,** make Great and Blunder: they mark the plays that changed who was ahead, which is chess's "turned the game". A +10 point play at 5% isn't a turn.
- **8 points as well as a band:** a first draft used 4, and under it an early lone kill in a golden game (43.7% to 39.5%, −4.2) read as a Blunder. With 8 it reads Mistake.
- **One fight at a time:** a play runs on while its events are less than 20 seconds apart, so a fed champion's three pickoffs 15 seconds apart would count as 1 against 3. So a kill joins a fight only when it comes less than 10 seconds after the fight's last kill and less than 4,000 units from one of its kills, and a kill near two fights joins them. That makes those three 1 against 1 fights, keeps a dive top apart from a fight bot at the same moment, and still finds a 2 against 4 inside a longer play. A fight needs one of your champions, so enemies dying to a tower aren't a Brilliant.
- **Outnumbered by 2, not 1:** with 1, all three Brilliants in the golden games were 4-against-5 teamfights won big. The losing side of a big fight nearly always shows all five, so one fewer usually means a teammate stayed out of it, not that the fight was a risk. With 2, the golden games have none, which matches how rare Brilliant is in chess.
- **Left out:** Best (needs the other options), Miss (an unpunished slip is the absence of a play), Book (opening habits such as first back aren't plays). "Behind" alone doesn't make a Brilliant, since nearly every fight won while losing would count.
- `gradePlay(play, replay)` in `src/lib/analyzer/plays.ts` replaces `gradeOf(swing)`, because Brilliant needs the play's kills and Great and Blunder its chance before and after. `replayChances` sets each play's `grade` once on the server, so the page and the 60-second review read the same grade and don't work it out again.

## Consequences

- The replay and the 60-second review show the new grades now, with pills and marks built from the existing blue and red tokens; the Review board (JAS-107, JAS-108) restyles them. The MCP tools and Ask pass only the swing, and the game score and phase ratings don't use grades, so they don't change.
- The same play gets mirrored grades from the two teams' sides (a Great for one is a Blunder for the other), except Brilliant, which only the winning side can earn; the losing side's grade for that play is Mistake or Blunder.
- Brilliant counts champions from Riot's kill events, so an enemy who was there but neither died nor got a kill or assist isn't counted, and neither is a teammate who only stood nearby. Either way the count can be wrong, so a Brilliant can be missed or awarded to a fight that wasn't really outnumbered. How often hasn't been measured: the golden games have no Brilliant.
- The 4,000 units (the map is 14,900 across) sit in a gap in the golden games: kills less than 10 seconds apart were 3,423 apart or closer, or 4,460 or further. A fight spread wider than that is split, and two fights closer together are joined, either of which can miss or award a Brilliant. A kill Riot gave no position is a fight of its own, which can split one real fight in two.
- The thresholds (1, 4 and 8 points, 40% and 60%, 2 fewer champions) are constants in `plays.ts`, chosen on the three golden games with a timeline (the remake has none). `golden.test.ts` checks each jungler's grade counts in them. A later change that moves the thresholds replaces this record.
