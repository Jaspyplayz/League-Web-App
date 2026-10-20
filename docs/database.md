# Database

Turnpoint caches Riot API data in Supabase Postgres so it never asks Riot for the same thing twice. The plan behind this is in [match-analyzer.md](./match-analyzer.md#rate-limits-and-caching); this doc covers the tables, the setup, and how to use them from code.

## Tables

| Table | One row per | Refetch from Riot |
|---|---|---|
| `players` | searched player (by PUUID), with their latest match IDs | the whole profile after 24 h, or on "Update" (2 min cooldown) |
| `ranked_entries` | player × ranked queue | with the player's profile |
| `rank_history` | player × ranked queue × change, a dated copy of the rank | never; a row is added whenever a profile save finds the rank, LP or games played changed ([`src/lib/rank-history.ts`](../src/lib/rank-history.ts)), for the LP graph |
| `player_seasons` | player × season, every match ID they played that season | with the player's profile; the games fill into `matches` 10 per profile or Champions tab visit |
| `matches` | game, with the full match-v5 JSON in `raw` | never |
| `match_participants` | player × game (the scoreboard, plus the wards, multikills and CS at 10 the Champions tab adds up) | never (filled from `matches.raw`; migration 0015 filled the 0014 columns for older games) |
| `match_timelines` | game, trimmed timeline | never, fetched only when the match is opened |
| `match_insights` | player × game, analyzer output | never; recomputed locally when `version` changes |
| `benchmark_games` | Sampled player (Iron to Challenger) × game, summary only, with the player's tier | filled by `npm run benchmarks`; keeps each player's last 20, deletes games older than 60 days |
| `score_games` | benchmark game, all ten players' end-of-game numbers (no names or PUUIDs) | never; filled by `npm run benchmarks`, read by `npm run train-score` ([docs/game-score.md](game-score.md)) |
| `win_chance_games` | benchmark game, both teams' gold, XP, kills, towers, dragons and buffs at every minute (no names or PUUIDs) | never; filled by `npm run benchmarks`, which deletes games older than 60 days; read by `npm run train-win-chance` ([docs/win-chance.md](win-chance.md)) |
| `user_players` | signed-in account, the player it marked with "This is me" | never; Supabase deletes the row when the account is deleted |
| `match_notes` | signed-in account × game, a private note on that game | never; deleted with the account, or when the note is cleared |
| `record_games` | player × game, the early-game numbers [personal records](records.md) compare (CS at 10, gold lead at 15, level 6, deaths and takedowns before 14:00) | never; worked out from the saved match and timeline, again when `RECORDS_VERSION` changes |
| `match_recaps` | game × player, a short AI-written recap ([match-recap.md](match-recap.md)) | never; games don't change |
| `ask_questions` | one question on the Ask tab, with Claude's answer, the games it read and its cost ([ask.md](ask.md)) | never; deleted with the account |
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

- **Profile** ([`src/lib/profile-store.ts`](../src/lib/profile-store.ts)): the icon, level, rank and latest 10 match IDs are one saved snapshot, like op.gg's. `loadProfile` fetches a new one (`summoner-v4`, `league-v4` and the `match-v5` ID list) when there's none, it's older than `TTL_MS.profile`, or it was saved for another region. The Update button calls `updateProfile`, which refetches it unless `match_ids_fetched_at` is within `TTL_MS.updateCooldown`. The player row and its `ranked_entries` are replaced in one transaction. The Riot ID lookup (`account-v1`) still runs on every visit, since it's how the page finds the PUUID.
- **Matches** ([`src/lib/match-store.ts`](../src/lib/match-store.ts)): fetch `match-v5` only for IDs not already in `matches`.
- **Timeline:** fetch when a match is opened and there's no `match_timelines` row; store the trimmed version with a `trim_version`.

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
- PUUIDs are tied to the Riot app that issued the key. When Turnpoint switches to a production key, empty this table (`delete from benchmark_games`) and run the script again.
