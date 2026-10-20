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
| **Riot client** | `src/lib/riot/` | The only code that calls Riot. Adds the key, times out after 8 seconds, retries server errors, and backs off when Riot says "too many requests". |

The **analyzer** (`src/lib/analyzer/`) sits beside these layers, not under them. It takes match JSON and returns results, with no network or database, which is why it has the most tests.

Files that touch the Riot key or the database start with `import "server-only"`, so the build fails if a browser component ever imports one.

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

A development key allows 100 requests every 2 minutes, and a brand new player can take 20 or more. Three things keep Turnpoint inside that:

1. **The cache.** Most visits cost zero Riot calls.
2. **A budget per page.** Insights and season stats fetch only a few missing games per visit and fill in the rest over the next few loads, so a 100-game view can't use the whole allowance at once.
3. **Backing off.** After a "too many requests" answer, the client refuses to call that region again until Riot's `Retry-After` time has passed. Riot can disable keys that keep calling after being told to stop.

## Models

The game score and win chance are trained offline by scripts (`npm run train-score`, `npm run train-win-chance`) on games saved in Postgres. The scripts write the learned weights to JSON files in `src/lib/analyzer/`, and the site only loads those weights, so a prediction is a few multiplications with no model server.

## Known limits

These are fine for a portfolio site's traffic, and are the next things to fix before a production Riot key brings more:

- **The back-off lives in memory.** Vercel runs several copies of the app at once, and each keeps its own pause timer, so they can't see each other's usage. Also, the client waits for Riot to complain instead of counting requests first. The fix is a shared counter in Postgres or Redis.
- **`/api/mcp` has no request limit.** An AI app looking up many new players could spend the Riot allowance for everyone.
- **One free database.** Supabase's free tier holds 500 MB and has no downloadable backups. Matches can be fetched again, but accounts, goals and notes can't.
- **No uptime check.** Sentry reports errors, but nothing alerts when the site is down or the daily dev key has expired.

## Saying it in an interview

> Turnpoint is a Next.js app on Vercel. Pages render on the server so the Riot API key never reaches the browser. Each request goes through a store layer that reads from a Postgres cache first: finished matches never change, so they're fetched from Riot once and kept forever, while profiles expire after a day. Every Riot call goes through one client that handles timeouts, retries and rate-limit back-off. The analysis is pure TypeScript functions that run on the saved match every time, so they're easy to unit-test and improving them never costs API calls. The two models are logistic regressions trained offline, shipped as JSON weights. The biggest thing I'd change at scale is moving the rate limiter from memory into a shared store, since serverless instances can't see each other.
