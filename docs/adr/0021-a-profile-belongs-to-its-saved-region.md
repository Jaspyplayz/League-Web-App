# 0021: A profile belongs to its saved region

Status: draft (JAS-41, issue #150). Jasper accepts it by merging the PR.

## Context

Riot accounts are global, so a Riot ID can be looked up on any server's page, such as an NA player's on `/player/euw/...`. `saveProfile` in `src/lib/profile-store.ts` saved whatever that server sent over the player's row: the region became EUW, the rank and match IDs were replaced with EUW's (usually none), and the rank history skipped. `seasonMatchIds` in `src/lib/season-store.ts` saved EUW's season list over the NA one the same way. A single wrong-server visit, by anyone, broke the player's real page and the daily season sync until their next visit on NA.

## Options

1. Save every region separately (a region column in the key of `players`, `ranked_entries` and `player_seasons`). Correct for players who really play on two servers, but it's a migration on the most-read tables, and every query that finds a player by PUUID would need the region too.
2. Keep one saved profile per player, and only let a visit to its saved region change it. A visit to another region still shows what that server sent, but saves nothing.
3. Refuse to show a player on a region they aren't saved for. Simple, but a player who really moved servers could never be looked up on the new one.

## Decision

Option 2. The upsert in `saveProfile` has a `setWhere` and returns the rows it wrote:

- **The saved region wins.** A visit updates the row only when it's saved for the same region. When it wrote nothing, the transaction stops before touching `ranked_entries`, and no rank history is written. Only the Riot ID (name and tag) is updated, since it's global.
- **Except a row with no summoner.** The search box starts on NA, so a EUW player's first visit can land on a server Riot has no summoner for, and save an empty row there. A later visit that finds their summoner replaces it (`setWhere: region = <this region> or summoner_level is null`). Without this, that empty row would stick for good, the daily season sync and the "This is me" link would follow it, and nothing could repair it. Rows the old bug already saved under a server with no summoner repair themselves the same way.
- `Profile.stored` says whether the page shows the saved profile. Another region's page draws no LP graph, since `rank_history` belongs to the saved region.
- **Only Riot's "not found" means no summoner** (JAS-71). A saved level of null lets another server take the row, so when the summoner call fails for any other reason, such as an outage or a rate limit, the save leaves the row's icon and level as they are and saves the rest (rank, match IDs, Riot ID, and the time, so Update's cooldown starts). A first visit then saves a row with no level, which the next visit that reaches Riot on that server fills in.
- The Update button on another region's page asks Riot nothing: the page fetches a fresh profile on each load anyway, and that load also replaces a saved row with no summoner when it finds one. So a click there costs no more than a reload.
- `seasonMatchIds` reads the saved region first, and on another region's page neither uses the saved season list nor saves the fetched one. A first visit still saves both, since the page saves the profile before it reads the season list.

## Consequences

- One wrong-server visit can't overwrite anyone's real profile, rank, rank history or season list. Tests in `src/lib/profile-store-save.test.ts` and `src/lib/season-store.test.ts` fail on main's code.
- Another region's page costs Riot calls on every load, since nothing is cached for it: the profile (3 calls), the season list (1 to 10 pages, from both the plain page and the Champions tab) and up to 10 games a view. About 9 calls a load for a player with 500 season games, out of the key's 100 every 2 minutes. Before this, the first such load saved them, and a load on the player's own server paid them again. The games themselves are still saved in `season_games` like any game, which is what lets the page skip them next time.
- A player who plays on two servers keeps the first one with a summoner saved. One gap (JAS-71): when their first visit ever lands during a summoner-v4 outage, the row is saved with no level, since there's no way to store "unknown" without a migration. For the next day visits to that server read the snapshot without asking Riot, so a visit to their other server can take the row first. A player who really moves servers keeps their old region's profile until a later change handles moves. Their page on the new server still shows the new server's data, fetched each time.
- The Log tab's LP history still reads `rank_history` for the saved region on any region's page; it has no profile to tell it otherwise.
- No migration and no new kind of stored data, so a revert puts main's behaviour back.
