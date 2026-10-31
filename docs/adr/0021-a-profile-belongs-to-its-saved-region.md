# 0021: A profile belongs to its saved region

Status: draft (JAS-41, issue #150). Jasper accepts it by merging the PR.

## Context

Riot accounts are global, so a Riot ID can be looked up on any server's page, such as an NA player's on `/player/euw/...`. `saveProfile` in `src/lib/profile-store.ts` saved whatever that server sent over the player's row: the region became EUW, the rank and match IDs were replaced with EUW's (usually none), and the rank history skipped. `seasonMatchIds` in `src/lib/season-store.ts` saved EUW's season list over the NA one the same way. A single wrong-server visit, by anyone, broke the player's real page and the daily season sync until their next visit on NA.

## Options

1. Save every region separately (a region column in the key of `players`, `ranked_entries` and `player_seasons`). Correct for players who really play on two servers, but it's a migration on the most-read tables, and every query that finds a player by PUUID would need the region too.
2. Keep one saved profile per player, and only let a visit to its saved region change it. A visit to another region still shows what that server sent, but saves nothing.
3. Refuse to show a player on a region they aren't saved for. Simple, but a player who really moved servers could never be looked up on the new one.

## Decision

Option 2. The upsert in `saveProfile` has `setWhere: players.region = <this region>` and returns the rows it wrote. When it wrote none, the row belongs to another region, so the transaction stops before touching `ranked_entries`, and no rank history is written. `seasonMatchIds` reads the saved region first, and on another region's page neither uses the saved season list nor saves the fetched one. A first visit, with no saved row, still saves, as before.

## Consequences

- One wrong-server visit can't overwrite anyone's profile, rank, rank history or season list. Tests in `src/lib/profile-store-save.test.ts` and `src/lib/season-store.test.ts` fail on the old code.
- Each visit to another region's page asks Riot again, since nothing is cached for it. That costs a few calls per visit, the same as a first visit.
- A player who really moves servers keeps their old region's profile saved until a later change handles moves. Their page on the new server still shows the new server's data, just fetched each time.
- The Update button on another region's page fetches and shows, but saves nothing, and its cooldown follows the saved region's profile.
- No migration and no new stored data, so a revert puts the old behaviour back.
