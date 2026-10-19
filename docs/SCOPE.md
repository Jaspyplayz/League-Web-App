# Scope

A League of Legends web app where you look up any player by Riot ID and get more than a stats page: a breakdown of *why* each game went the way it did.

This doc is the plan for the first version. It will change as we build.

## Standout feature

**Chosen: A, the match analyzer.** The table keeps the alternatives for reference.

| Option | What it does | Why it's interesting | Effort |
|---|---|---|---|
| **A. Match analyzer** (recommended) | For any game, compares you to your lane opponent minute by minute (gold, CS, XP, damage) using the match timeline, flags the turning points ("you fell 1.2k gold behind between 8 and 12 min, after dying twice to the jungler"), and rolls the last 20 games up into "your recurring weaknesses". | Real data engineering: timeline parsing, aggregation, caching around strict rate limits. Easy to demo with a chart. Clear story in an interview. | Medium |
| **B. Champion pool advisor** | Looks at a player's history and recommends which champions to focus on, which to drop, and their worst matchups. | Fun recommendation logic, but needs a lot of matches per player before it says anything useful. | Medium |
| **C. Live game scout** | During loading screen, shows each opponent's recent form, main champions and win streaks. | Very visible, but depends on the spectator API and on someone being in a game when a recruiter clicks the link. Hard to demo. | Medium-high |

**Why A:** It works for any player at any time (good for demos), it builds on the same match data the core app needs anyway, and it naturally adds B-style insights later.

## MVP pages

1. **Home / search**: search by Riot ID (`GameName#TAG`) and region.
2. **Player profile**: name, icon, level, ranked tier, and the last 20 matches (champion, KDA, CS, result, game length).
3. **Match detail**: all 10 players, items, damage, and the standout analysis for the searched player (lead/deficit chart and turning points).
4. **Insights tab** on the profile: trends across recent games.

Out of scope for v1: user accounts, live game scouting, mobile app, every queue type beyond ranked solo/flex and normal draft. The only live data is the profile's "In game" badge (spectator-v5): it says the looked-up player is in a game, with the mode and minutes, and never shows the other players or their champions, which Riot's policy treats as scouting.

## Data model sketch

Postgres tables. Riot data is cached here so we don't refetch matches, which never change once played.

```
players
  puuid (pk), game_name, tag_line, region, profile_icon_id,
  summoner_level, last_fetched_at

ranked_entries
  puuid (fk), queue_type, tier, rank, lp, wins, losses, fetched_at

matches
  match_id (pk), region, queue_id, patch, game_start, duration_s,
  raw jsonb          -- full match-v5 payload, so we can recompute later

match_participants
  match_id (fk), puuid, team_id, champion_id, role, win,
  kills, deaths, assists, cs, gold, damage, vision, items int[]
  pk (match_id, puuid)

match_timelines
  match_id (pk, fk), frames jsonb   -- per-minute frames from match-v5 timeline

match_insights
  match_id, puuid, opponent_puuid, gold_diff_at_10, cs_diff_at_10,
  xp_diff_at_10, turning_points jsonb, computed_at, version
  pk (match_id, puuid)
```

Champion, item and rune names and images come from Data Dragon (static files), not the database.

## Riot API notes

- Endpoints: `account-v1` (Riot ID to PUUID), `summoner-v4`, `league-v4` (rank), `match-v5` (match list, match, timeline).
- Rate limits on a dev key are about 20 requests/second and 100 per 2 minutes. One profile load can need 20+ match calls, so caching and request queuing are core work, not an afterthought.
- Dev keys expire every 24 hours. Apply for a production key once there's a public prototype.
- The API key stays server-side only (Next.js route handlers / server components), never in the browser.

## Stack

| Choice | Why |
|---|---|
| **Next.js (App Router) + TypeScript** | One codebase for UI and API routes; server components keep the Riot key off the client. |
| **Tailwind CSS + shadcn/ui** | Fast to build a polished UI without a custom design system. |
| **Supabase Postgres** | Free hosted Postgres with a dashboard; already connected to Claude. |
| **Drizzle ORM** | Typed queries and migrations, lighter than Prisma. |
| **Upstash Redis** (later) | Short-lived cache and rate-limit counters. Start with Postgres only; add Redis when we hit limits. |
| **Recharts** | Simple charts for the gold/CS timelines. |
| **Vercel** | Zero-config Next.js hosting with preview URLs per PR; already connected to Claude. |
| **Sentry** | Production error tracking; already connected to Claude. |
| **Vitest + Playwright** | Unit tests for the analysis logic, one end-to-end test of the search flow. |
| **GitHub Actions** | Lint, typecheck and tests on every PR. |

All free tiers. Local development runs with `npm run dev` against the free Supabase project, so nothing costs money until there's real traffic.

## Build order

1. Scaffold Next.js + TypeScript + Tailwind, CI, deploy "hello world" to Vercel.
2. Riot client with rate limiting, player lookup, profile page.
3. Database schema, match caching, match detail page.
4. Match analyzer: lane-opponent comparison, turning points, insights tab.
5. Tests, README with screenshots and architecture diagram, production key application.
