# Architecture

How Turnpoint's pieces fit together, and what happens when someone opens a page. For the features themselves see the [README](README.md); for the data model see [docs/SCOPE.md](docs/SCOPE.md).

## The short version

Turnpoint is one Next.js app on Vercel. The browser never talks to Riot: every page is built on the server, which reads from a Postgres cache first and only asks Riot for what's missing. The analysis itself is pure TypeScript that runs on the saved match every time, so it never needs to be stored.

```mermaid
flowchart LR
    B[Browser] --> P
    AI[Claude and other<br/>AI apps] -->|MCP| MCP

    subgraph V[Vercel]
        P[Pages<br/>server components<br/>and server actions]
        MCP["/api/mcp"]
        S[Stores<br/>match-store, profile-store,<br/>season-store, recap-store]
        A[Analyzer and models<br/>pure functions]
        C[Riot client<br/>riot/client.ts]
        P --> S
        MCP --> S
        P --> A
        MCP --> A
        S --> C
    end

    C -->|account, league,<br/>match-v5| R[(Riot Games API)]
    S <-->|cache| DB[(Supabase<br/>Postgres)]
    P <-->|sign-in| AU[Supabase Auth]
    S -->|recap prompt| CL[Claude API<br/>Haiku]
    P -.->|errors| SE[Sentry]
    B -.->|images| DD[Data Dragon CDN]
```

## Three layers

Every request goes down the same three layers. Each layer only calls the one below it.

| Layer | Files | Job |
|---|---|---|
| **Pages** | `src/app/` | Read the URL, ask the stores for data, run the analyzer, render HTML. `/api/mcp` is a page too, it just answers AI apps with text instead of HTML. |
| **Stores** | `src/lib/*-store.ts` | Decide where data comes from: Postgres if it's saved and still fresh, otherwise Riot. Save what Riot returns. |
| **Riot client** | `src/lib/riot/` | The only code that calls Riot. Waits its turn under the rate limit, adds the key, times out after 8 seconds, retries server errors, and backs off when Riot says "too many requests". |

The **analyzer** (`src/lib/analyzer/`) sits beside these layers, not under them. It takes match JSON and returns results, with no network or database, which is why it has the most tests.

Files that touch the Riot key or the database start with `import "server-only"`, so the build fails if a browser component ever imports one.

## Where the code lives

Each folder and the files worth knowing in it. `CLAUDE.md` gives agents the short version and links here.

```
src/app/          Routes. player/[region]/[riotId]/ is the player page;
                  .../match/[matchId]/ under it is the match analysis page
                  and .../insights/ the trends across the last 20 to 100 games,
                  .../log/ the Log tab (one card per day, src/lib/daily-log.ts),
                  .../champions/ the season's stats per champion and enemy
                  champion (src/lib/champion-stats.ts);
                  settings/ only sends the old Settings page home (the theme
                  switch is in the header);
                  api/mcp/ is the MCP server, with its tools in src/lib/mcp/;
                  api/cron/season-sync/ the daily job that saves "This is me"
                  players' new games (docs/database.md);
                  robots.ts keeps crawlers off player pages and the API
src/components/   React components; ui/ holds small shared pieces
src/lib/          Plain TypeScript helpers, most with a .test.ts next to them
src/lib/riot/     Server-only Riot client (retries; rate-limit.ts counts requests, shared
                  across servers in Postgres by rate-limit-store.ts) and one function per endpoint
src/lib/analyzer/ Pure match analyzer: trims timelines, finds the opponent, turning points, deaths,
                  trends.ts rolls games up into the Insights page, compare.ts
                  sets them against one rank's games or one chosen player's
                  (skill.ts names the one skill behind that rank),
                  habits.ts reads early-game habits (habit-trends.ts splits wins by them),
                  sessions.ts groups games played back to back into blocks,
                  death-recap.ts adds up what hit you in each death,
                  score.ts is the trained 0 to 100 game score (score-model.json),
                  phase-score.ts the early, mid and late ratings (phase-score-model.json),
                  win-chance.ts each team's chance to win at every minute,
                  tempo.ts the jungle tempo timeline (tempo-study.ts checks it)
                  and replay.ts the replay, with items.ts and positions.ts
                  (item-check.ts and position-check.ts check them), rift.ts
                  (the Rift's walls, learned from games, which champions walk
                  around) and plays.ts (the chance to win at every second, plays graded by it);
                  review.ts picks the 60-second review's moments from those plays;
                  golden.test.ts checks the analyzer on four real games in fixtures/
src/lib/match-store.ts  Loads matches and timelines from Postgres, falling back to Riot
src/lib/own-data.ts  readOwnData: reads data a signed-in player made (notes, "This is me", Ask
                  history) and says when the read failed, unlike match-store's readCache
src/lib/profile-store.ts  A player's saved profile (rank, latest match IDs) and its Update button;
                  each save also adds changed ranks to rank_history for the LP graph
src/lib/trend-games.ts  A player's recent games summarized for Insights, a few timelines per view
src/lib/season-store.ts Season champion stats from slim season_games rows; loads 10 more per plain profile visit,
                  and syncSeasons fills in "This is me" players once a day (api/cron/season-sync)
src/lib/recap.ts  Claude API call for AI match recaps; recap-store.ts saves them
src/lib/ask.ts    Claude API agent loop for the Ask tab; ask-store.ts saves each question before Claude answers, ask-rules.ts the caps
src/db/           Drizzle schema, connection, and cache freshness rules
src/lib/supabase/ Supabase Auth clients (sign-in with Google and Discord); src/proxy.ts keeps sign-ins fresh
scripts/          Command-line jobs run with tsx (benchmarks, train-score, check-score, train-win-chance, train-phase-score, tempo study, item check, shot for screenshots, remap-puuids after a Riot key change, can-merge and the risky-paths list for Claude Code's own merges, can-merge-action for the Agent merge workflow, wellness for the biweekly check in docs/wellness.md; can-merge-rest.ts turns GitHub's REST answers into what the gates check, tested on the saved answers in can-merge-fixtures/)
drizzle/          Generated SQL migrations (never edit by hand)
docs/             Design and research docs, decision records in adr/, and the agent
                  mistakes log in agent-mistakes/ (one file per mistake class,
                  listed in agent-mistakes.md; scripts/agent-mistakes.test.ts checks it)
e2e/              Playwright smoke test and accessibility scan, run against each Vercel preview;
                  fixtures.ts gets past the preview login (shot uses preview-login.ts too)
eslint-rules/     The project's own lint rules (Riot hosts only in src/lib/riot/, "server-only"
                  on files that read secrets, no green classes), run by npm run lint, tested in npm test
.github/          CI, smoke test, dependency review, reviewer and agent merge workflows, Dependabot, PR and issue templates
.claude/          Claude Code settings, hooks/ (lint and typecheck before commits, installs when
                  a cloud session starts, pstack's startup instruction, and Matt Pocock's skills
                  for cloud sessions, see docs/workflow.md), agents/ (reviewer.md,
                  plus pstack's four), agent-merge.json (the switch for npm run can-merge, read from main),
                  rules/ (rules for one area, loaded when Claude opens a file there),
                  skills/ (postmortem and the three verify skills, plus eight copied
                  from other repos and pstack's 65, see docs/workflow.md#pstack)
```

## What happens when you open a match

```mermaid
sequenceDiagram
    participant B as Browser
    participant P as Match page
    participant S as match-store
    participant DB as Postgres
    participant R as Riot

    B->>P: GET /player/na/Name-TAG/match/NA1_123
    P->>S: loadMatch and loadTimeline
    S->>DB: is NA1_123 saved?
    alt saved (every visit after the first)
        DB-->>S: match and timeline
    else first visit ever
        S->>R: match-v5 match and timeline
        R-->>S: JSON
    end
    S-->>P: match and timeline
    P->>P: run the analyzer (win chance, turning points, deaths)
    P-->>B: HTML
    S->>DB: save the match, after the page is sent
```

The save happens with Next.js's `after()`, so the visitor never waits for the database write. If the database is down or not set up, the page still works by asking Riot, and the failure goes to Sentry.

## Caching rules

| Data | Kept for | Why |
|---|---|---|
| Finished matches and timelines | Forever | A game never changes once it's over. |
| A player's profile (rank, latest match IDs) | 1 day, or until someone clicks Update | Rank changes, but not every minute. Update has a 2 minute cooldown so nobody can spend the rate limit by clicking. |
| AI recaps | Forever | The match doesn't change, so neither does the recap. Capped at 20 new ones per account per day. |
| Analysis results | Not stored | Recomputed on every visit, so improving the analyzer never means refetching anything. |

The rules live in `src/db/freshness.ts`.

## Staying inside Riot's rate limit

A development key allows 20 requests a second and 100 every 2 minutes, per region, and a brand new player can take 20 or more. Four things keep Turnpoint inside that:

1. **The cache.** Most visits cost zero Riot calls.
2. **A budget per page.** Insights and season stats fetch only a few missing games per visit and fill in the rest over the next few loads, so a 100-game view can't use the whole allowance at once. The daily season sync spends about 60 calls a run, lists included (70 at worst).
3. **Counting before calling, shared by every server.** Vercel runs several copies of the app at once, and none of them can see the others' memory. So the count lives in Postgres: one row per Riot region in `riot_rate_limits`, holding how many requests each of Riot's windows has used. Before every request the client locks that row, asks a pure function (`takeTurn` in `src/lib/riot/rate-limit.ts`) whether one more fits, and saves the new count. Locking the row means two servers asking at the same moment take turns, so they can't both spend the last request in a window. A short wait (the per-second limit) is slept through; a long one (the 2 minute window is used up) fails right away with "try again in N seconds".
4. **Backing off.** After a "too many requests" answer, the client refuses to call that region again until Riot's `Retry-After` time has passed, and saves that time in the same row so every server waits. Riot can disable keys that keep calling after being told to stop.

The count is an extra, like the cache: if the database is missing or slow (over a second), the request goes ahead and Riot's own answer is the safety net.

## Models

The game score and win chance are trained offline by scripts (`npm run train-score`, `npm run train-win-chance`) on games saved in Postgres. The scripts write the learned weights to JSON files in `src/lib/analyzer/`, and the site only loads those weights, so a prediction is a few multiplications with no model server.

## Known limits

These are fine for a portfolio site's traffic, and are the next things to fix before a production Riot key brings more:

- **Every Riot request costs a database round trip** for the shared count, a few milliseconds next to Riot's hundreds. At much higher traffic, Redis would be the usual home for a counter like this.
- **The limits are written in the code** (`RIOT_LIMITS`), set for a development key. A production key allows more, so they need changing when the key does.
- **`/api/mcp` has no request limit.** An AI app looking up many new players could spend the Riot allowance for everyone.
- **Crawlers are only asked to stay out.** Each profile links to the 90 or so players in its games, and a new player costs about 15 to 35 Riot calls and saves their games for good, so a crawler following those links could use up the allowance and fill the database. `src/app/robots.ts` asks crawlers to skip `/player/` and `/api/` (link preview bots on Discord, X and LinkedIn may open player pages, since they only open the one pasted link). On a profile, only the plain page (no `?queue=` or `?games=`) loads more of the season's games; the Champions tab does too, on each of its game-mode links. Polite crawlers like Google's follow robots.txt; others don't. For one that ignores it, the biggest cost is the match list: each game-mode tab has a URL for every 10 games up to 200 (`?games=10` to `?games=200`, reaching back two months), and each URL loads up to 20 unsaved games (`MISSING_PER_VIEW` in `src/lib/more-games.ts`), so up to 200 unsaved games per tab per player. Without a database (a fresh local checkout) nothing is remembered, so a URL loads every game it lists. Vercel's bot protection (a dashboard setting) would be the next step.
- **One free database.** Supabase's free tier holds 500 MB and has no downloadable backups. Matches can be fetched again, but accounts, goals and notes can't.
- **No uptime check.** Sentry reports errors, but nothing alerts when the site is down or the daily dev key has expired.

## Saying it in an interview

> Turnpoint is a Next.js app on Vercel. Pages render on the server so the Riot API key never reaches the browser. Each request goes through a store layer that reads from a Postgres cache first: finished matches never change, so they're fetched from Riot once and kept forever, while profiles expire after a day. Every Riot call goes through one client that handles timeouts and retries, and counts requests against Riot's rate limit in Postgres before calling, because serverless instances can't see each other's memory. The analysis is pure TypeScript functions that run on the saved match every time, so they're easy to unit-test and improving them never costs API calls. The two models are logistic regressions trained offline, shipped as JSON weights. At much higher traffic I'd move that counter to Redis, since every Riot call now costs a database round trip.
