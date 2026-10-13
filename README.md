# Turnpoint

**Find out why you won or lost.** Turnpoint looks up any League of Legends player by Riot ID and breaks each game down minute by minute against the opponent in their role, so you can see exactly where it turned.

[![CI](https://github.com/Jaspyplayz/League-Web-App/actions/workflows/ci.yml/badge.svg)](https://github.com/Jaspyplayz/League-Web-App/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Live site:** https://league-web-app.vercel.app

> **Status:** early development. Player search and the app's foundations are live. Real match data and the match analyzer are being built now. Everything below marked _planned_ isn't built yet.

<!--
  SCREENSHOTS: add them once the UI polish lands. See docs/screenshots/README.md
  for the shot list and file names, then replace this block with e.g.
  ![Match analysis](docs/screenshots/match-analysis.png)
-->
_Screenshots coming soon. The UI is being polished; see [docs/screenshots](docs/screenshots/README.md)._

## Why Turnpoint

Stats sites tell you *what* happened: your KDA, your CS, whether you won. Turnpoint is built to tell you *why*. It compares you to the enemy player in the same role, one minute at a time, and points at the moments that decided the game:

> **8:00 to 12:00:** you fell from +300 to −900 gold. You died twice, both times to the enemy jungler.

Across your recent games it turns those moments into patterns you can act on, like "you're behind in CS at 10 minutes in 14 of your last 20 games."

## Features

| Feature | Status |
|---|---|
| Search any player by Riot ID (`GameName#TAG`) and region | ✅ Built |
| Shareable player URLs (`/player/kr/Faker-KR1`) | ✅ Built |
| Player profile: rank, level and recent matches from the Riot API | 🚧 In progress |
| Match detail: full scoreboard for all 10 players | Planned |
| **Match analyzer:** gold, CS and XP difference vs your role opponent, per minute | Planned |
| **Turning points:** the 1 to 3 biggest swings in a game, each with a plain-English reason | Planned |
| Death breakdown: solo killed, ganked, teamfight or caught | Planned |
| Insights tab: trends and recurring weaknesses across your last 20 games | Planned |

## How the match analyzer works

The analyzer is the core of the project. The full research and design is in [docs/match-analyzer.md](docs/match-analyzer.md); here's the short version.

1. **Get the data.** Riot's match timeline API has a snapshot of every player's gold, CS, XP and position for every minute of a game, plus a timestamped list of every kill, objective and item purchase.
2. **Find your opponent.** The player on the enemy team in the same role (top, jungle, mid, bot or support).
3. **Build the difference curves.** Your gold, CS and XP minus theirs, minute by minute. Above zero means you're ahead.
4. **Find turning points.** Slide a window over the gold curve, keep the biggest swings, and explain each one from the events inside that window (deaths, ganks, tower plates, objectives).
5. **Roll it up.** Across your recent games, apply simple, tested rules like "behind at 10 minutes in most games" to surface recurring weaknesses.

**Why compare to the opponent in your role?** Riot's API has no "average Gold-rank player" benchmark, and building one would mean crawling thousands of games. The enemy in your role is at roughly the same rank, on the same patch, in the same game. It's also how pro analysts talk about laning.

## Tech stack

| Technology | Role | Why | Status |
|---|---|---|---|
| [Next.js 16](https://nextjs.org) (App Router) + TypeScript | UI and server code | One codebase for pages and API logic. Server components keep the Riot API key off the browser. | ✅ In use |
| [Tailwind CSS 4](https://tailwindcss.com) | Styling | Fast to build a consistent UI without writing a design system from scratch. | ✅ In use |
| [Vitest](https://vitest.dev) | Unit tests | Fast, TypeScript-native, and a natural fit for testing the analyzer's pure functions. | ✅ In use |
| [GitHub Actions](https://github.com/features/actions) | CI | Lint, type check, test and build on every pull request. | ✅ In use |
| [Vercel](https://vercel.com) | Hosting | Zero-config Next.js hosting, automatic deploys from `main`, and a preview link for every PR. | ✅ In use |
| [Riot Games API](https://developer.riotgames.com) | Player and match data | The official source for accounts, ranks, matches and timelines. | 🚧 In progress |
| [Supabase](https://supabase.com) Postgres + [Drizzle ORM](https://orm.drizzle.team) | Match cache | Matches never change once played, so storing them avoids refetching and keeps us inside Riot's rate limits. | Planned |
| [Sentry](https://sentry.io) | Error tracking | Reports crashes on the live site with the exact error and stack trace. | Planned |
| [Recharts](https://recharts.org) | Charts | Simple line charts for the gold, CS and XP curves. | Planned |
| [Playwright](https://playwright.dev) | End-to-end tests | One browser test of the search flow. | Planned |

Everything runs on free tiers.

## Architecture

```mermaid
flowchart LR
    U[Browser] -->|search Riot ID| N

    subgraph V[Vercel]
        N[Next.js app<br/>server components<br/>and server actions]
        A[Analyzer<br/>pure TypeScript]
        Q[Rate-limited<br/>Riot client]
        N --> A
        N --> Q
    end

    Q -->|account, summoner,<br/>league, match-v5| R[(Riot Games API)]
    N <-->|cached players,<br/>matches, timelines,<br/>insights| DB[(Supabase<br/>Postgres)]
    N -.->|errors| S[Sentry]
    N -.->|champion and<br/>item images| DD[Data Dragon CDN]
```

Today the app is the search page and player route on Vercel. The Riot client, database and Sentry are being added now, and the analyzer comes after them.

**Key design decisions**

- **The API key never reaches the browser.** All Riot calls happen on the server, in server components and server actions.
- **Cache forever what never changes.** A finished match and its timeline are permanent, so they're stored once in Postgres. Only things that do change (rank, the latest match list) get short cache lifetimes.
- **One rate-limited queue for every Riot call.** A personal API key allows 100 requests every 2 minutes, and loading one new player can take 20+ calls. The client reads Riot's rate-limit headers and backs off on `429` responses instead of hard-coding limits.
- **The analyzer is pure functions.** Match JSON in, insights out: no network, no database. That makes it easy to unit-test against saved real games.
- **Insights are versioned.** Each stored result records the algorithm version that produced it, so improving the analyzer means recomputing from stored data, not refetching from Riot.

The data model and the reasoning behind each choice are in [docs/SCOPE.md](docs/SCOPE.md).

## Project structure

```
src/
  app/                          Next.js routes (App Router)
    page.tsx                    Home page with the search form
    actions.ts                  Server action that validates a search and redirects
    player/[region]/[riotId]/   Player profile page
  components/                   React components (search form)
  lib/                          Plain TypeScript helpers, each with a .test.ts
    regions.ts                  Region list and Riot's platform/regional routing
    riot-id.ts                  Parse and validate "GameName#TAG", build URL slugs
docs/
  SCOPE.md                      Scope, data model, stack and build order
  match-analyzer.md             Analyzer research: Riot data, insights, rate limits
```

## Running locally

You need [Node.js 22](https://nodejs.org) or newer and a Riot API key from the [Riot developer portal](https://developer.riotgames.com) (a free development key works).

```bash
git clone https://github.com/Jaspyplayz/League-Web-App.git
cd League-Web-App
npm install
cp .env.example .env.local   # then paste your Riot API key into .env.local
npm run dev
```

Open http://localhost:3000.

`.env.local` is ignored by git, so your key is never committed. Development keys expire every 24 hours; regenerate one in the portal when requests start failing.

## Testing and CI

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript type check |
| `npm test` | Unit tests (Vitest) |

[GitHub Actions](.github/workflows/ci.yml) runs lint, type check, tests and a production build on every pull request and every push to `main`. Vercel deploys `main` to the live site and builds a preview for each pull request.

Current tests cover Riot ID parsing and URL slugs, and region routing. The analyzer's tests will run against saved real match and timeline JSON files, one per role plus edge cases like remakes.

## Roadmap

- [x] Scope the app and pick the standout feature ([SCOPE.md](docs/SCOPE.md))
- [x] Research the match analyzer ([match-analyzer.md](docs/match-analyzer.md))
- [x] Scaffold Next.js, TypeScript, Tailwind, tests and CI
- [x] Deploy to Vercel
- [ ] Riot API client with rate limiting, and a real player profile
- [ ] Supabase schema and match caching
- [ ] Sentry error tracking
- [ ] Match detail page with the scoreboard
- [ ] Match analyzer: opponent comparison chart, @10/@15 snapshot, turning points
- [ ] Insights tab with cross-game trends
- [ ] End-to-end test of the search flow
- [ ] Riot production API key and a custom domain

**Later ideas:** where-you-die heatmaps, item timing vs your own average, vision timelines, champion-specific advice.

## Legal

Turnpoint isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games and all associated properties are trademarks or registered trademarks of Riot Games, Inc.

## Author

Built by Jasper ([@Jaspyplayz](https://github.com/Jaspyplayz)), a second-year student at the University of Toronto.
<!-- Add a LinkedIn or portfolio link here. -->

Released under the [MIT License](LICENSE).
