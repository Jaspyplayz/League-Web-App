# Database

Turnpoint caches Riot API data in Supabase Postgres so it never asks Riot for the same thing twice. The plan behind this is in [match-analyzer.md](./match-analyzer.md#rate-limits-and-caching); this doc covers the tables, the setup, and how to use them from code.

## Tables

| Table | One row per | Refetch from Riot |
|---|---|---|
| `players` | searched player (by PUUID), with their latest match IDs | the whole profile after 24 h, or on "Update" (2 min cooldown) |
| `ranked_entries` | player × ranked queue | with the player's profile |
| `rank_history` | player × ranked queue × change, a dated copy of the rank | never; a row is added whenever a profile save finds the rank, LP or games played changed ([`src/lib/rank-history.ts`](../src/lib/rank-history.ts)), for the LP graph |
| `player_seasons` | player × season, every match ID they played that season | with the player's profile, and by the [daily season sync](#the-daily-season-sync); the games fill into `season_games` 10 per visit to the plain profile page (All tab, first 10 games), and into `matches` 10 per visit to the Champions tab |
| `season_games` | player × game, only the champion, result, K/D/A, CS, mode, start time and length the Season box adds up (about 100 bytes, against about 90 KB for a whole match) | never; filled by the profile and the daily season sync. Games already in `matches` count too, so none is fetched twice. Moved to the new PUUID when the Riot key changes |
| `matches` | game, with the full match-v5 JSON in `raw` | never |
| `match_participants` | player × game (the scoreboard, plus the wards, multikills and CS at 10 the Champions tab adds up) | never (filled from `matches.raw`; migration 0015 filled the 0014 columns for older games) |
| `match_timelines` | game, trimmed timeline | never, fetched only when the match is opened |
| `match_insights` | player × game, analyzer output | never; recomputed locally when `version` changes |
| `benchmark_games` | Sampled player (Iron to Challenger) × game, summary only, with the player's tier | filled by `npm run benchmarks`; keeps each player's last 20, deletes games older than 60 days |
| `score_games` | benchmark game, all ten players' end-of-game numbers (no names or PUUIDs) | never; filled by `npm run benchmarks`, read by `npm run train-score` and `npm run check-score` ([docs/game-score.md](game-score.md)) |
| `win_chance_games` | benchmark game, both teams' gold, XP, kills, towers, dragons and buffs at every minute (no names or PUUIDs) | never; filled by `npm run benchmarks`, which deletes games older than 60 days; read by `npm run train-win-chance` ([docs/win-chance.md](win-chance.md)) |
| `user_players` | signed-in account, the player it marked with "This is me" | never; Supabase deletes the row when the account is deleted |
| `match_notes` | signed-in account × game, a private note on that game | never; deleted with the account, or when the note is cleared |
| `match_recaps` | game × player, a short AI-written recap ([match-recap.md](match-recap.md)) | never; games don't change |
| `ask_questions` | one question on the Ask tab, with Claude's answer, the games it read and its cost ([ask.md](ask.md)) | never; deleted with the account |
| `ask_spend` | one question's cost and date, with no account, question or answer, for the site's monthly Ask budget ([ask.md](ask.md#limits-and-cost)) | never; outlives a deleted account, so its spending still counts |
| `riot_rate_limits` | Riot host (`na1`, `americas`...), how many requests each of Riot's rate limit windows has used and any cooldown after a 429 ([`src/lib/riot/rate-limit-store.ts`](../src/lib/riot/rate-limit-store.ts)) | not Riot data; updated before every Riot request so all servers share one count |

The schema lives in [`src/db/schema.ts`](../src/db/schema.ts), with a comment on every column that isn't obvious. The refresh rules live in [`src/db/freshness.ts`](../src/db/freshness.ts).

Row level security is on for every table with no policies. The app connects to Postgres directly from the server, which isn't affected by RLS, while Supabase's public REST API can't read or write anything. Sign-in (see [sign-in.md](sign-in.md)) also goes through the server, so nothing needs that API.

## Setup

The Supabase project is `turnpoint` (free tier, `us-east-1`, same region as Vercel's default functions). The tables already exist there.

1. In the Supabase dashboard, open the project, then **Project Settings → Database → Reset database password**. Save the new password in a password manager.
2. Click **Connect** at the top of the dashboard and copy two connection strings, putting your password in place of `[YOUR-PASSWORD]`:
   - **Transaction pooler** (port `6543`) → `DATABASE_URL`
   - **Session pooler** (port `5432`) → `DATABASE_URL_DIRECT`
3. Put both in `.env.local` (see `.env.example`).
4. In Vercel, **Project → Settings → Environment Variables**, add `DATABASE_URL` (transaction pooler) for Production and Preview. Vercel doesn't need `DATABASE_URL_DIRECT`.

Use the pooler URLs, not the "Direct connection" one: on the free tier the direct host is IPv6-only, which many home networks and Vercel can't reach.

## Changing the schema

1. Edit `src/db/schema.ts`.
2. `npm run db:generate` writes a new SQL file in `drizzle/`. Read it: it's the exact SQL that will run.
3. `npm run db:migrate` applies any SQL files the database hasn't seen yet (it uses `DATABASE_URL_DIRECT`).
4. Commit the schema change and the new `drizzle/` files together.

`npm run db:studio` opens a browser view of the tables, handy for checking what got cached.

## Using it from code

Import from `@/db` in server code only (Server Components, Server Actions, route handlers). The file starts with `import "server-only"`, so importing it into a Client Component fails the build.

```ts
import { desc, eq, inArray } from "drizzle-orm";
import { getDb, tables } from "@/db";
import { isFresh, TTL_MS } from "@/db/freshness";

const db = getDb();

// Is this player cached and recent enough?
const player = await db.query.players.findFirst({
  where: eq(tables.players.puuid, puuid),
});
if (!isFresh(player?.fetchedAt, TTL_MS.profile)) {
  // call Riot, then upsert:
  await db
    .insert(tables.players)
    .values({ puuid, gameName, tagLine, region, profileIconId, summonerLevel })
    .onConflictDoUpdate({
      target: tables.players.puuid,
      set: { gameName, tagLine, profileIconId, summonerLevel, fetchedAt: new Date() },
    });
}

// Which of these match IDs do we still need to fetch?
const known = await db
  .select({ id: tables.matches.matchId })
  .from(tables.matches)
  .where(inArray(tables.matches.matchId, matchIds));

// Store a match once. It never changes, so a duplicate is ignored.
await db.transaction(async (tx) => {
  await tx.insert(tables.matches).values({ matchId, platformId, queueId, gameVersion, gameStartAt, durationS, raw }).onConflictDoNothing();
  await tx.insert(tables.matchParticipants).values(participantRows).onConflictDoNothing();
});

// A player's last 20 games, newest first.
const games = await db
  .select()
  .from(tables.matchParticipants)
  .innerJoin(tables.matches, eq(tables.matches.matchId, tables.matchParticipants.matchId))
  .where(eq(tables.matchParticipants.puuid, puuid))
  .orderBy(desc(tables.matches.gameStartAt))
  .limit(20);
```

### Wiring it into the Riot client

Pages don't call Riot for cached data directly; they go through a thin layer that checks Postgres first:

- **Profile** ([`src/lib/profile-store.ts`](../src/lib/profile-store.ts)): the icon, level, rank and latest 10 match IDs are one saved snapshot, like op.gg's. `loadProfile` fetches a new one (`summoner-v4`, `league-v4` and the `match-v5` ID list) when there's none, it's older than `TTL_MS.profile`, or it was saved for another region. The Update button calls `updateProfile`, which refetches it unless `match_ids_fetched_at` is within `TTL_MS.updateCooldown`. The player row and its `ranked_entries` are replaced in one transaction, but only when the row is new, saved for the same region, or saved with no summoner (a first visit to a server the player never played on): Riot accounts are global, so anyone can open a player on a server they don't play on, and that visit shows what the other server sent without saving it over the real profile ([0021](adr/0021-a-profile-belongs-to-its-saved-region.md)). Only Riot's "not found" counts as no summoner: when the summoner call fails for another reason, nothing is saved. The season list (`player_seasons`) follows the same rule, and the Update button on another region's page asks Riot nothing. The Riot ID lookup (`account-v1`) still runs on every visit, since it's how the page finds the PUUID.
- **Matches** ([`src/lib/match-store.ts`](../src/lib/match-store.ts)): fetch `match-v5` only for IDs not already in `matches`.
- **Timeline:** fetch when a match is opened and there's no `match_timelines` row; store the trimmed version with a `trim_version`.

## The daily season sync

Once a day, some time between 09:00 and 10:00 UTC (Vercel's Hobby plan picks the minute), Vercel calls `/api/cron/season-sync` (the schedule is in [`vercel.json`](../vercel.json), the route in [`src/app/api/cron/season-sync/route.ts`](../src/app/api/cron/season-sync/route.ts)). For every player someone marked "This is me" (`user_players`), it brings the season's match list up to date, usually with one call for the newest 100 games (the whole list again only after 100 or more new games). Then it saves the missing games to `season_games`, newest first. A run makes up to about 60 Riot calls, lists and games together (`SYNC_CALLS` in [`src/lib/season-store.ts`](../src/lib/season-store.ts)), which leaves room in the key's 100 calls per 2 minutes for people using the site. Once everyone is caught up, that's about one call per player. A list is only counted once it's in, so a whole list asked for near the end of a run can take it up to 10 calls over (70 in all); the shared rate limiter is what keeps the site inside Riot's limit. The calls left after the lists are shared out one game per player in turn (`fairShares`), so a new player's backlog of hundreds of games, which finishes over the following days, doesn't hold up anyone else's new games. If the lists alone ever use up the calls, the players left wait for the next run, and the order starts one player further along each day so it isn't always the same ones.

Vercel sends the `CRON_SECRET` environment variable as a bearer token, and the route refuses any call without it, so nobody else can make the site spend its Riot calls. Set `CRON_SECRET` in Vercel (Production) to any long random string; without it the sync never runs. Each run writes every player to the function's logs on Vercel, with the games it saved, the games still missing and any Riot error (a failed list call too, even when every game is already in), and a run with any Riot error also goes to Sentry as a warning, so a rejected key doesn't quietly stop the season boxes filling in.

## Benchmark games

`benchmark_games` holds the games Insights compares you with: recent ranked solo games from players sampled from every rank, Iron to Challenger, on KR, EUW and NA. Each row records the player's tier, and Insights' "You vs [rank]" menu shows one tier at a time. Nothing on the site writes to it. `npm run benchmarks` ([`scripts/collect-benchmarks.ts`](../scripts/collect-benchmarks.ts)) fills it, using the `RIOT_API_KEY` and `DATABASE_URL` in `.env.local`:

```sh
npm run benchmarks                                          # every tier, KR, EUW and NA, 10 players per tier
npm run benchmarks -- --tiers gold,diamond                  # just some tiers
npm run benchmarks -- --regions na --tiers gold --players 2 # a quick test
```

- Players come from Riot's league endpoints. Iron to Diamond have four divisions, so a quarter of each tier's players come from page 1 of each division. Master, Grandmaster and Challenger are one ladder each. Within a ladder or division, players are spread from the top LP to the bottom (`samplePlayers` in `src/lib/analyzer/benchmarks.ts`), skipping anyone with fewer than 20 ranked games this season.
- Each row is the small per-game summary from `summarizeGame`, the same one Insights makes of your games. The match and timeline aren't stored, but all ten players' end-of-game numbers go to `score_games` as training data for the game score (a few KB a game instead of the match's 60 KB), and both teams' numbers at every minute go to `win_chance_games` as training data for the win chance model (about 3 KB a game). Each player keeps only their last 20 ranked games, so a full run holds about 6,000 rows (3 servers × 10 tiers × 10 players × 20 games), plus older players' games until they pass 60 days.
- The script stays under 70 Riot calls per 2 minutes per server, leaving the live site part of the key's allowance. A first full run takes about 2 hours (the three servers run side by side). Later runs skip games already saved, and a stopped run loses nothing, so it's fine to run a few tiers at a time with `--tiers`.
- When `summarizeGame` gains a stat, its column is added as nullable and `BENCHMARK_STATS_VERSION` in `src/db/rows.ts` goes up. The next run fetches games saved with an older `stats_version` again and updates them, so it costs about as much as a first run. Until then, Insights leaves a new stat out of the comparison for any group with fewer than 10 games that have it. Version 2 added XP lead at 15, kills + assists before 14:00, vision per minute, and the jungle and support stats (time on the stronger side and in the enemy half, lane takedowns, objective share, enemy jungle monsters, scuttle crabs; see `src/lib/analyzer/roaming.ts` and `trends.ts`). Version 3 added the win chance training data, and version 4 the [habits](habits.md) (level 6 first, first scuttles, first gank and first back).
- One-tricks aren't stored. They're worked out from the rows (`findOneTricks` in `src/lib/analyzer/benchmarks.ts`): someone with at least 60% of their last 20 games on one champion.
- PUUIDs are tied to the Riot app that issued the key. When Turnpoint switches to a key from another app, the old rows have to go before the next run ([below](#when-the-riot-key-changes)).

## When the Riot key changes

Riot encrypts PUUIDs separately for each app. A refreshed key from the same app keeps every PUUID, but a key from another app sees every player under a different one. Rows saved under the old key then stop matching: the profile looks for the visitor's new PUUID in each saved game, doesn't find it, and leaves the game out. This happened when the site moved to Jasper's personal key on 2026-10-24 ([#154](https://github.com/Jaspyplayz/League-Web-App/issues/154), [decision record 0007](adr/0007-remap-puuids-after-key-change.md)).

`npm run remap-puuids` ([`scripts/remap-puuids.ts`](../scripts/remap-puuids.ts)) moves the rows saved before the cutoff to the new PUUIDs. It reads `RIOT_API_KEY` and `DATABASE_URL` from `.env.local` like the other scripts, and needs the key the live site uses: if `.env.local` still holds an old dev key, set `RIOT_API_KEY` in the shell first, which wins over the file. Only Jasper runs `--apply` and `--rollback`:

```sh
npm run remap-puuids                                                       # dry run: writes the map, changes nothing
npm run remap-puuids -- --apply .cache/puuid-remap/map-<time>.json         # back up, then move every row
npm run remap-puuids -- --rollback .cache/puuid-remap/backup-<time>.jsonl  # put back exactly the backed-up rows
```

- **The dry run** checks the key on 4 games first, and stops if it's the old app's key (every PUUID would come back unchanged) or a third app's. Then it downloads every old game again, at most 50 calls every 2 minutes on each Riot region, about 30 minutes for 1,300 games. It pairs each player by participant number, checking the champion and team. A game Riot can't find, a game whose players don't match, and a PUUID that maps two ways all go on the skip list. It prints its counts next to the plan's.
- **`--apply`** saves every row it will change or delete to a backup file first. Then, in one transaction, it moves `players`, `ranked_entries`, `player_seasons`, `season_games`, `rank_history`, `user_players`, `match_recaps`, `ask_questions`, `match_insights`, `matches.raw` and `match_participants`, and deletes the old `benchmark_games` rows. Where a player has a row under both PUUIDs, the new one stays. Any failed check rolls everything back. After the commit it cleans up twice, right away and 5 minutes later, because a page that read a game just before the commit can save its old scoreboard rows again. Running it again with the same map only cleans up. It refuses to start if the database plus the extra space it needs would pass 450 MB.
- **Right after `--apply`, run `npm run benchmarks`.** The apply deletes every old `benchmark_games` row, which on 2026-10-24 was all of them, so Insights has no rank comparisons until the collector fills the table again (about 2 hours for a full run, and Insights caches the old answer for up to an hour).
- **`--rollback`** refuses a backup file from an apply that stopped before changing anything, and a backup whose apply never committed or was already rolled back. Use the file the finished apply printed after "To undo". It keeps a `players` row the apply created if the site has saved rows under it since, so those rows aren't lost.
- **The files** in `.cache/puuid-remap/` hold PUUIDs. Never commit them, and delete them once the site checks out.
- **Next time,** change `CUTOFF` in `scripts/remap-puuids-map.ts` and the two players in `ANCHORS` in `scripts/remap-puuids-db.ts`, who must each have a players row under both keys. Before applying for a production key, ask Riot whether the new app can keep this one's PUUIDs; that would make the remap unnecessary.

`scripts/remap-puuids-db.test.ts` runs the dry run, apply and rollback against a throwaway Postgres with a fake Riot. It empties the app's tables, so it only runs when `REMAP_TEST_DATABASE_URL` points at localhost. Set `DATABASE_URL_DIRECT` on the command line, so it wins over `.env.local`, and use `127.0.0.1`: Docker on Windows may not answer `localhost` over IPv6. The `auth` schema stands in for Supabase's.

```sh
docker run -d --rm --name remap-pg -e POSTGRES_PASSWORD=local -p 127.0.0.1:55432:5432 postgres:17
docker exec remap-pg psql -U postgres -c "create schema auth; create table auth.users (id uuid primary key);"
DATABASE_URL_DIRECT=postgres://postgres:local@127.0.0.1:55432/postgres npm run db:migrate
REMAP_TEST_DATABASE_URL=postgres://postgres:local@127.0.0.1:55432/postgres npx vitest run scripts/remap-puuids-db.test.ts
docker stop remap-pg
```
