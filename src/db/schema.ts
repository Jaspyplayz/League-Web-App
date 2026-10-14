// Postgres tables that cache Riot API data. See docs/database.md for how the
// cache is meant to be read and filled.
//
// Matches and timelines never change once a game ends, so they are stored
// forever. Player and rank data do change, so each has a fetched_at column
// that src/db/freshness.ts compares against a TTL.
//
// Every table has row level security on with no policies. The app talks to
// Postgres directly from the server, which bypasses RLS, while Supabase's
// public REST API (used with the anon key) can't read or write anything.
import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

const timestamptz = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" });

// One row per player someone has searched for. Keyed by PUUID because Riot
// IDs (Name#TAG) can change; the PUUID never does.
export const players = pgTable(
  "players",
  {
    puuid: text("puuid").primaryKey(),
    gameName: text("game_name").notNull(),
    tagLine: text("tag_line").notNull(),
    // Our region key from src/lib/regions.ts, e.g. "na" or "euw".
    region: text("region").notNull(),
    profileIconId: integer("profile_icon_id"),
    summonerLevel: integer("summoner_level"),
    // When account-v1 and summoner-v4 were last called for this player.
    fetchedAt: timestamptz("fetched_at").notNull().defaultNow(),
    // When league-v4 was last called. Null means never.
    rankedFetchedAt: timestamptz("ranked_fetched_at"),
    // When the match ID list was last refreshed. Drives the "Update" cooldown.
    matchIdsFetchedAt: timestamptz("match_ids_fetched_at"),
    // The player's latest match IDs, newest first, as of match_ids_fetched_at.
    // The profile page lists these games until the next update.
    matchIds: text("match_ids").array(),
  },
  (t) => [
    // Lets a search for "faker#kr1" in "kr" skip the account-v1 call when we
    // already know the player. Case-insensitive, like Riot IDs.
    index("players_riot_id_idx").on(
      t.region,
      sql`lower(${t.gameName})`,
      sql`lower(${t.tagLine})`,
    ),
  ],
).enableRLS();

// Ranked standing per queue. A player with no rows here is unranked (check
// players.ranked_fetched_at to tell "unranked" from "never fetched").
export const rankedEntries = pgTable(
  "ranked_entries",
  {
    puuid: text("puuid")
      .notNull()
      .references(() => players.puuid, { onDelete: "cascade" }),
    // "RANKED_SOLO_5x5" or "RANKED_FLEX_SR".
    queueType: text("queue_type").notNull(),
    tier: text("tier").notNull(),
    rank: text("rank").notNull(),
    leaguePoints: integer("league_points").notNull(),
    wins: integer("wins").notNull(),
    losses: integer("losses").notNull(),
    fetchedAt: timestamptz("fetched_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.puuid, t.queueType] })],
).enableRLS();

// One row per game, stored once and never refetched.
export const matches = pgTable(
  "matches",
  {
    // Riot's match ID, e.g. "NA1_5012345678".
    matchId: text("match_id").primaryKey(),
    // Riot's platform, e.g. "NA1", from info.platformId.
    platformId: text("platform_id").notNull(),
    queueId: integer("queue_id").notNull(),
    // Full patch string from info.gameVersion, e.g. "16.20.712.3456".
    gameVersion: text("game_version").notNull(),
    gameStartAt: timestamptz("game_start_at").notNull(),
    durationS: integer("duration_s").notNull(),
    // The whole match-v5 payload, so new stats can be pulled out later
    // without calling Riot again.
    raw: jsonb("raw").notNull(),
    fetchedAt: timestamptz("fetched_at").notNull().defaultNow(),
  },
  (t) => [index("matches_game_start_at_idx").on(t.gameStartAt)],
).enableRLS();

// The scoreboard: one row per player per game, copied out of matches.raw so
// the profile page can list a player's games with a plain query.
export const matchParticipants = pgTable(
  "match_participants",
  {
    matchId: text("match_id")
      .notNull()
      .references(() => matches.matchId, { onDelete: "cascade" }),
    // Not a foreign key: most of the 10 players in a game were never searched.
    puuid: text("puuid").notNull(),
    // 1 to 10. Links this row to the timeline's participantFrames.
    participantId: smallint("participant_id").notNull(),
    // 100 is blue side, 200 is red side.
    teamId: smallint("team_id").notNull(),
    championId: integer("champion_id").notNull(),
    championName: text("champion_name").notNull(),
    // "TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY", or "" in odd games.
    teamPosition: text("team_position").notNull(),
    win: boolean("win").notNull(),
    kills: smallint("kills").notNull(),
    deaths: smallint("deaths").notNull(),
    assists: smallint("assists").notNull(),
    // totalMinionsKilled + neutralMinionsKilled.
    cs: integer("cs").notNull(),
    goldEarned: integer("gold_earned").notNull(),
    damageToChampions: integer("damage_to_champions").notNull(),
    visionScore: integer("vision_score").notNull(),
    // item0 to item6 in slot order; 0 means an empty slot.
    items: integer("items").array().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.matchId, t.puuid] }),
    index("match_participants_puuid_idx").on(t.puuid),
  ],
).enableRLS();

// Every match ID a player played this season, for the season champion stats
// on their profile. Riot lists 100 IDs per call, so the list is refreshed
// only when the profile snapshot is (see src/lib/season-store.ts). The games
// themselves are loaded a few per visit into matches.
export const playerSeasons = pgTable(
  "player_seasons",
  {
    puuid: text("puuid")
      .notNull()
      .references(() => players.puuid, { onDelete: "cascade" }),
    // SEASON.id from src/lib/season.ts, e.g. "2026".
    season: text("season").notNull(),
    // Newest first, every game mode.
    matchIds: text("match_ids").array().notNull(),
    fetchedAt: timestamptz("fetched_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.puuid, t.season] })],
).enableRLS();

// A trimmed match-v5 timeline, fetched only when someone opens the match.
// Raw timelines are several hundred KB, so we keep just what the analyzer
// reads (see docs/match-analyzer.md, "Don't store raw timelines").
export const matchTimelines = pgTable("match_timelines", {
  matchId: text("match_id")
    .primaryKey()
    .references(() => matches.matchId, { onDelete: "cascade" }),
  // Per-minute frames: gold, XP, CS, level, position and damage per player.
  frames: jsonb("frames").notNull(),
  // Only the event types the analyzer uses (kills, objectives, items, ...).
  events: jsonb("events").notNull(),
  // Bump when the trimming format changes, so old rows can be refetched.
  trimVersion: smallint("trim_version").notNull(),
  fetchedAt: timestamptz("fetched_at").notNull().defaultNow(),
}).enableRLS();

// The analyzer's output for one player in one game. Pure function of the
// stored match + timeline, so it can be recomputed any time without Riot.
export const matchInsights = pgTable(
  "match_insights",
  {
    matchId: text("match_id")
      .notNull()
      .references(() => matches.matchId, { onDelete: "cascade" }),
    puuid: text("puuid").notNull(),
    // Null when no lane opponent could be found (remakes, odd games).
    opponentPuuid: text("opponent_puuid"),
    // Differences vs the lane opponent. Null when the game ended earlier.
    goldDiffAt10: integer("gold_diff_at_10"),
    csDiffAt10: integer("cs_diff_at_10"),
    xpDiffAt10: integer("xp_diff_at_10"),
    goldDiffAt15: integer("gold_diff_at_15"),
    csDiffAt15: integer("cs_diff_at_15"),
    xpDiffAt15: integer("xp_diff_at_15"),
    turningPoints: jsonb("turning_points").notNull().default([]),
    // Bump when the analyzer changes; rows with an older version get
    // recomputed from the stored data.
    version: smallint("version").notNull(),
    computedAt: timestamptz("computed_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.matchId, t.puuid] }),
    index("match_insights_puuid_idx").on(t.puuid),
  ],
).enableRLS();

// Benchmark games: one row per game from a sampled solo queue player of some
// rank (Iron to Challenger, on KR, EUW or NA), collected by
// `npm run benchmarks`. Insights compares your games with these. Only the
// small per-game summary from summarizeGame is kept, not the match or
// timeline, so thousands of games stay a few MB.
//
// PUUIDs are tied to the Riot API key's app. If Turnpoint moves to a new key
// (a production key), delete every row here and collect again.
export const benchmarkGames = pgTable(
  "benchmark_games",
  {
    matchId: text("match_id").notNull(),
    puuid: text("puuid").notNull(),
    // Our region key from src/lib/regions.ts: "kr", "euw" or "na".
    region: text("region").notNull(),
    // The player's ranked tier when collected, as in src/lib/tiers.ts. Rows
    // from before tiers were added were all Challenger.
    tier: text("tier").notNull().default("CHALLENGER"),
    gameStartAt: timestamptz("game_start_at").notNull(),
    championName: text("champion_name").notNull(),
    // "TOP", "JUNGLE", "MIDDLE", "BOTTOM" or "UTILITY".
    position: text("position").notNull(),
    win: boolean("win").notNull(),
    // You minus your opponent, as in GameTrend. Null when the game ended earlier.
    goldAt10: integer("gold_at_10"),
    csAt10: integer("cs_at_10"),
    goldAt15: integer("gold_at_15"),
    // DeathLabel[] for each death before 14:00, e.g. ["gank", "solo"].
    earlyDeaths: jsonb("early_deaths").notNull(),
    csPerMinEarly: real("cs_per_min_early").notNull(),
    csPerMinMid: real("cs_per_min_mid"),
    csPerMinLate: real("cs_per_min_late"),
    collectedAt: timestamptz("collected_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.matchId, t.puuid] }),
    // Insights loads one tier's games at a time.
    index("benchmark_games_tier_idx").on(t.tier),
    index("benchmark_games_puuid_idx").on(t.puuid),
  ],
).enableRLS();
