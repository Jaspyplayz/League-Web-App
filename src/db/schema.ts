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
  uuid,
} from "drizzle-orm/pg-core";
import { authUsers } from "drizzle-orm/supabase";

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

// A dated copy of a ranked_entries row, kept each time a player's rank
// changes, so the profile can draw an LP graph. Riot has no rank history of
// its own. Rows are only added, never updated; see src/lib/rank-history.ts.
export const rankHistory = pgTable(
  "rank_history",
  {
    puuid: text("puuid")
      .notNull()
      .references(() => players.puuid, { onDelete: "cascade" }),
    queueType: text("queue_type").notNull(),
    tier: text("tier").notNull(),
    rank: text("rank").notNull(),
    leaguePoints: integer("league_points").notNull(),
    wins: integer("wins").notNull(),
    losses: integer("losses").notNull(),
    recordedAt: timestamptz("recorded_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.puuid, t.queueType, t.recordedAt] })],
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
    // The rest are for the profile's Champions tab, which adds up a whole
    // season of games: reading each game's full JSON for that is too slow.
    // Null in rows saved before migration 0014 whose game lacked the field.
    individualPosition: text("individual_position"),
    damageTaken: integer("damage_taken"),
    objectiveDamage: integer("objective_damage"),
    earlySurrender: boolean("early_surrender"),
    wardsPlaced: smallint("wards_placed"),
    wardsKilled: smallint("wards_killed"),
    controlWards: smallint("control_wards"), // control wards placed
    doubleKills: smallint("double_kills"),
    tripleKills: smallint("triple_kills"),
    quadraKills: smallint("quadra_kills"),
    pentaKills: smallint("penta_kills"),
    // Lane minions plus jungle monsters killed in the first 10 minutes, from
    // Riot's "challenges" stats, for the laning column.
    csAt10: smallint("cs_at_10"),
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
    // Added in stats version 2 (see BENCHMARK_STATS_VERSION in rows.ts), so
    // older rows have nulls here until the script refills them. Null also
    // means the stat doesn't apply to the role, as in GameTrend.
    xpAt15: integer("xp_at_15"),
    earlyTakedowns: integer("early_takedowns"),
    visionPerMin: real("vision_per_min"),
    strongerSide: real("stronger_side"),
    enemyHalf: real("enemy_half"),
    gankTakedowns: integer("gank_takedowns"),
    objectiveShare: real("objective_share"),
    enemyJungleKills: integer("enemy_jungle_kills"),
    scuttles: integer("scuttles"),
    // Habits (src/lib/analyzer/habits.ts), added in stats version 4. Null
    // means it didn't happen or doesn't apply, as in Habits, and older rows
    // have nulls until the script refills them (HABITS_VERSION in rows.ts).
    level6First: boolean("level_6_first"),
    firstScuttleLead: integer("first_scuttle_lead"),
    firstGankS: integer("first_gank_s"),
    firstBackS: integer("first_back_s"),
    statsVersion: integer("stats_version").notNull().default(1),
    collectedAt: timestamptz("collected_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.matchId, t.puuid] }),
    // Insights loads one tier's games at a time.
    index("benchmark_games_tier_idx").on(t.tier),
    index("benchmark_games_puuid_idx").on(t.puuid),
  ],
).enableRLS();

// Training data for the game score (src/lib/analyzer/score.ts): the
// end-of-game numbers of all ten players in each benchmark game, without
// names or PUUIDs. A whole match is about 60 KB, this is a few KB, so
// thousands of games stay small. `npm run benchmarks` fills it and
// `npm run train-score` reads it, along with the matches table.
export const scoreGames = pgTable("score_games", {
  matchId: text("match_id").primaryKey(),
  // A ScoreGame: { matchId, durationS, players: ScorePlayer[] }.
  game: jsonb("game").notNull(),
  collectedAt: timestamptz("collected_at").notNull().defaultNow(),
}).enableRLS();

// Training data for the win chance model (src/lib/analyzer/win-chance.ts):
// each team's gold, XP, kills, towers, dragons and buffs at every minute of
// each benchmark game, and which side won. No names or PUUIDs. About 3 KB a
// game. `npm run benchmarks` fills it, deleting games older than 60 days,
// and `npm run train-win-chance` reads it, along with the games opened on
// the site (matches and match_timelines).
export const winChanceGames = pgTable(
  "win_chance_games",
  {
    matchId: text("match_id").primaryKey(),
    // "16.20", so training can stick to recent patches.
    patch: text("patch").notNull(),
    gameStartAt: timestamptz("game_start_at").notNull(),
    // A WinChanceGame: { matchId, patch, blueWin, frames }.
    game: jsonb("game").notNull(),
    collectedAt: timestamptz("collected_at").notNull().defaultNow(),
  },
  (t) => [index("win_chance_games_start_idx").on(t.gameStartAt)],
).enableRLS();

// Which player each signed-in account picked with "This is me" on a profile,
// so the header can link back to it. At most one per account. It isn't
// checked with Riot (anyone could pick any player), which is fine because
// only that account ever sees it; Riot sign-in (issue #40) could verify it.
export const userPlayers = pgTable("user_players", {
  // The account in Supabase Auth's own auth.users table. Deleting the
  // account deletes this row with it.
  userId: uuid("user_id")
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  // The player's name and region come from the players row, so the link
  // follows them if they change their Riot ID.
  puuid: text("puuid")
    .notNull()
    .references(() => players.puuid, { onDelete: "cascade" }),
  linkedAt: timestamptz("linked_at").notNull().defaultNow(),
}).enableRLS();

// Private notes a signed-in player writes on a match ("ward river before
// 3:15"). One note per account per game, only ever shown to that account.
export const matchNotes = pgTable(
  "match_notes",
  {
    // Deleting the account in Supabase Auth deletes its notes.
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    matchId: text("match_id")
      .notNull()
      .references(() => matches.matchId, { onDelete: "cascade" }),
    // Up to MAX_NOTE_LENGTH characters (src/lib/match-note.ts).
    text: text("text").notNull(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.matchId] })],
).enableRLS();

// A private note a signed-in player keeps on a day of their Log tab ("tilted
// after game 4, stopped"). One note per account per day, only ever shown to
// that account, on the profile it marked with "This is me".
export const dayNotes = pgTable(
  "day_notes",
  {
    // Deleting the account in Supabase Auth deletes its notes.
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    // "2026-10-16", the day in the player's own timezone (see
    // src/lib/daily-log.ts). Text, because a date column would be read back
    // in the server's timezone.
    day: text("day").notNull(),
    // Up to MAX_NOTE_LENGTH characters (src/lib/match-note.ts).
    text: text("text").notNull(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
).enableRLS();

// A short AI-written recap of one game from one player's side (see
// src/lib/recap.ts). Finished games never change, so each recap is written
// once and kept. Recaps only use public game stats, so anyone looking at that
// player's game sees it; only signed-in accounts can ask for a new one.
export const matchRecaps = pgTable(
  "match_recaps",
  {
    matchId: text("match_id")
      .notNull()
      .references(() => matches.matchId, { onDelete: "cascade" }),
    puuid: text("puuid").notNull(),
    // One line for the Log tab, then a few sentences for the match page.
    headline: text("headline").notNull(),
    detail: text("detail").notNull(),
    // Which Claude model wrote it, in case recaps are ever rewritten.
    model: text("model").notNull(),
    // The account that asked for it, to cap recaps per account per day.
    // Deleting the account keeps the recap but forgets who asked.
    createdBy: uuid("created_by").references(() => authUsers.id, { onDelete: "set null" }),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.matchId, t.puuid] }),
    index("match_recaps_created_by_idx").on(t.createdBy, t.createdAt),
  ],
).enableRLS();

// Questions asked on a player's Ask tab and Claude's answers (see
// src/lib/ask.ts). Private: only the account that asked sees them.
export const askQuestions = pgTable(
  "ask_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Deleting the account in Supabase Auth deletes its questions.
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    // The player the question was about.
    puuid: text("puuid").notNull(),
    question: text("question").notNull(),
    // Null while Claude is answering, and when it couldn't. The row is
    // kept anyway, so the try still counts toward the day's questions and
    // the account's monthly allowance.
    answer: text("answer"),
    // The games Claude read to answer, as AskGame[] (src/lib/ask-rules.ts),
    // for the links under the answer.
    games: jsonb("games").$type<{ matchId: string; label: string }[]>().notNull(),
    // Which Claude model answered, and what it cost in millionths of a
    // dollar, so the account's monthly allowance (src/lib/ask-rules.ts) can
    // add it up. While Claude is answering it holds an estimate instead.
    model: text("model").notNull(),
    costMicros: integer("cost_micros").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("ask_questions_user_idx").on(t.userId, t.createdAt),
    index("ask_questions_created_at_idx").on(t.createdAt),
  ],
).enableRLS();

// What each Ask question cost, for the whole site's monthly budget
// (src/lib/ask-rules.ts). It's kept apart from ask_questions because those
// rows are deleted with their account, and the money an account already
// spent shouldn't go back into the month's budget with them. So a row here
// has no account, no question and no answer: only a cost and a date.
export const askSpend = pgTable(
  "ask_spend",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Millionths of a dollar, like ask_questions.cost_micros: an estimate
    // while Claude is answering, then the real cost.
    costMicros: integer("cost_micros").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [index("ask_spend_created_at_idx").on(t.createdAt)],
).enableRLS();

// Riot's rate limit, shared by every copy of the app (see
// src/lib/riot/rate-limit-store.ts). Vercel runs several copies at once, and
// each one only knows its own requests, so the count has to live somewhere
// they all can see. One row per Riot host ("na1", "americas").
export const riotRateLimits = pgTable("riot_rate_limits", {
  host: text("host").primaryKey(),
  // A WindowCount[] (src/lib/riot/rate-limit.ts): for each of Riot's limits,
  // when the current window began (milliseconds) and how many requests it
  // has used.
  windows: jsonb("windows")
    .$type<{ start: number; count: number }[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  // Set when Riot answers "too many requests": nobody calls this host
  // before then.
  cooldownUntil: timestamptz("cooldown_until"),
}).enableRLS();
