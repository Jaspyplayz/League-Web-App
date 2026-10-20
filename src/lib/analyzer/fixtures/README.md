# Golden games

Real ranked solo/duo games saved from the site's database for [`../golden.test.ts`](../golden.test.ts). It runs the analyzer on each one and checks what a player would notice: who is ahead of their lane opponent at 10 and 15 minutes, and which stretches are picked as turning points. The first three were picked from the 51 ranked games saved with a trim version 2 timeline in October 2026, by team gold per minute (team 100 is participants 1 to 5, team 200 is 6 to 10). The remake is the shortest of all the saved ranked games.

| File | Shape | Length | Why it was picked | Point of view |
|---|---|---|---|---|
| `stomp.json` | Stomp | 15:16 | Red was ahead from the first minute (6,375 gold up at 10:00, 13,312 at 15:00) and blue surrendered at 15:16 | Talon, red's jungler (participant 7), who won |
| `comeback.json` | Comeback | 32:58 | The biggest comeback saved: blue was 8,401 gold behind at 21:00 and won | Naafiri, blue's jungler (2), who won |
| `close.json` | Close game | 32:53 | Of the games 25 minutes or longer, the one with the smallest biggest lead: 3,337 | Elise, red's jungler (7), who lost, so one game has turning points that went against you |
| `remake.json` | Remake | 1:05 | The shortest saved game, under the 15 minutes the analyzer needs | None: it's too short to analyze |

Each file is `{ "match": ..., "timeline": { "frames": [...], "events": [...] } }`, minified. `match` is Riot's match-v5 data (`Match` in `src/lib/riot/types.ts`). `timeline` is the trimmed timeline exactly as the `match_timelines` table stores it (`TrimmedTimeline` in `../trim.ts`, trim version 2), saved before the site kept unspent gold and item sales. `remake.json` has no timeline: the site never downloads one for a game under 15 minutes.

## How they were anonymized

The repo is public, and Riot's policies say products may not expose a player's historic Riot IDs. In each match:

- `metadata.matchId` is `GOLDEN_STOMP`, `GOLDEN_COMEBACK`, `GOLDEN_CLOSE` or `GOLDEN_REMAKE`.
- Every PUUID, in `metadata.participants` and each participant's `puuid`, is `golden-player-<participantId>`.
- Each participant's `riotIdGameName` is `Player <participantId>` and `riotIdTagline` is `GOLD`. `summonerName` and `summonerId` are empty, and `profileIcon` and `summonerLevel` are 0 (an unusual account level could point at a player).
- `info.gameId` is 0 and `info.gameName` is empty, since it held the game ID.
- `gameCreation` is 2026-01-01 00:00 UTC, and `gameStartTimestamp` and `gameEndTimestamp` keep their gaps from it. `gameEndTimestamp` has to stay set: without it, `gameDurationSeconds()` in `src/lib/match-summary.ts` reads `gameDuration` as milliseconds.

Everything else is as Riot sent it. Timelines name players only by participant ID, so they needed no changes.

## Adding a game

1. Find it in the database with SELECT queries only, since that's the live site's data. `matches.raw` holds the match; `match_timelines` holds `frames` and `events` (use a row with `trim_version = 2`). Pick games on numbers such as team gold per minute, not by reading whole timelines.
2. Write the file with a script, not by hand, so every number is exact. Keep it minified and keep this folder under about 600 KB.
3. Anonymize it as above, then search the file for every original PUUID, Riot ID, summoner ID, match ID and game ID. Nothing should match.
4. Add a `describe` to `../golden.test.ts` with a comment on why the game is there. Write the expected values as numbers from what the analyzer gives, after checking each one makes sense from the gold numbers.
