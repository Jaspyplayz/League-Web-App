# 0007: Re-download each old game to move saved rows to the new key's PUUIDs

Status: draft, waiting on Jasper's "In my words" (issue #154).

## Context

Riot encrypts PUUIDs separately for each app. On 2026-10-24 the live site moved to Jasper's personal key, which belongs to a different app than the dev keys before it, so every player now has a different PUUID. Every page turns the Riot ID into a PUUID with the live key, and the profile list looks for that PUUID inside each saved game. Games saved before 09:00 UTC that day hold the old PUUIDs, so they drop out of profiles, the Champions tab and recaps. Match pages still work, since they find the player by Riot ID.

On the live database that was 1,298 saved games with 8,222 distinct players, plus 11 `players` rows, their ranks, rank history and season lists, 2 paid AI recaps, and 23,579 `benchmark_games` rows. Riot has no rank history, so those rows can't be fetched again.

## Options considered

- **Re-download each old game and remap (chosen).** Each game, fetched with the new key, gives old to new for all of its players by participant number, without trusting Riot IDs, which can change hands. It costs one Riot call per game, about 30 minutes at half the key's limit.
- **Heal on read.** Fetch a saved game again when it lacks the viewer's PUUID. No bulk job, but every reader (profile list, season stats, Champions tab, recaps) would need it, and the tables keyed by PUUID would still need a map. More code on the live path.
- **Go back to a dev key from the old app.** The old PUUIDs come back, but the key expires every 24 hours, and the rows saved since the switch become the stale ones.
- **Wipe and refetch.** Loses the rank history and the paid recaps, and downloads the same games anyway.

For `benchmark_games`, remapping would cost about 22,000 calls, and Insights reads them by tier, never by PUUID. The risk is the next `npm run benchmarks`, which would save the same games again under new PUUIDs next to the old rows. Jasper chose to delete the old rows in the same step rather than wait for them to age out by 2026-12-19.

## Decision

`npm run remap-puuids` (`scripts/remap-puuids.ts`), run by Jasper with the key the live site uses:

1. **The dry run** first checks the key: the newest old game of Jaspy#CA1 and of Hide on bush#KR1 must map their old PUUIDs to their new-key `players` rows, and the 2 newest games saved since the cutoff must come back unchanged. An old app's key fails the first check, since every PUUID comes back as itself, and a third app's key fails the second. Then it downloads every old game, pairs players by participant number (checking champion and team), and writes the map and a skip list to the git-ignored `.cache/puuid-remap/`. It changes no app table.
2. **`--apply <map file>`** writes every row it will change or delete to a backup file, then moves them all in one transaction with the map in a TEMP table, so no migration is needed. Where a player has a row under both PUUIDs, the new one stays. `matches.raw` is rewritten by value through the map, so a skipped game is still fixed for anyone the map knows from another game. The transaction checks its own counts, that the backup still matches the rows it locked, and that no mapped PUUID is left anywhere in `raw`, and rolls back if any check fails. After the commit, it deletes old `match_participants` rows twice, right away and 5 minutes later, because a page that read a game just before the commit can save its old rows again.
3. **`--rollback <backup file>`** puts back exactly the backed-up rows by primary key and deletes the copies the apply created. It doesn't run the map backwards, because the live site keeps writing new-key rows after the apply. It refuses a backup from an apply that stopped early or never committed, and it refuses to run twice.

## Consequences

Good:
- Rank history and the paid recaps are kept, and no live page gains code.
- The key check stops the run before 1,300 calls when the key is wrong, which is the one mistake every other check would miss.
- A second `--apply` with the same map only cleans up, and a failed apply changes nothing.

Bad:
- About 1,300 Riot calls in one go, paced to leave half the key's limit to the site.
- Insights has no rank comparisons from the apply until `npm run benchmarks` fills the table again, about 2 hours.
- The apply leaves about 70 MB of the database used that a plain VACUUM doesn't give back, on a free tier of 500 MB.
- The map and backup files hold PUUIDs on Jasper's computer until they're deleted.
- Rollback deletes the `players` copies it created, and anything the site saved under them after the apply goes with them, since their foreign keys cascade. Its counts leave those rows out.
- Rollback doesn't clean up afterwards, so a page that read a game just before it can save that game's new-key scoreboard rows again.
- A recap written under an old PUUID at the instant of the commit isn't caught by the cleanup.
- The next key change needs `CUTOFF` and the two anchor players updated by hand. Asking Riot whether a new app can keep this one's PUUIDs would make the remap unnecessary.

## In my words

_(Jasper writes this.)_
