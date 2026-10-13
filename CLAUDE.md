# CLAUDE.md

Context and rules for Claude Code sessions working in this repo, on Jasper's computer or in the cloud.

@AGENTS.md

## What this is

**Turnpoint** is a League of Legends stats site: look up a player by Riot ID, then see each game broken down minute by minute against the enemy in the same role, with the turning points explained. The match analyzer is the standout feature.

It's a portfolio project for Jasper (a second-year UofT student, new to TypeScript and React) to help land a software internship. Code and PRs should be easy for him to read and explain in an interview.

- Live site: https://league-web-app.vercel.app (Vercel auto-deploys `main`; every PR gets a preview)
- Scope and data model: [docs/SCOPE.md](docs/SCOPE.md)
- Analyzer research: [docs/match-analyzer.md](docs/match-analyzer.md)
- Database tables and setup: [docs/database.md](docs/database.md)

## Stack

Next.js 16 (App Router) + TypeScript, Tailwind CSS 4, Supabase Postgres via Drizzle ORM, Riot Games API, Sentry, Vitest, GitHub Actions, Vercel. Node 22.

## Layout

```
src/app/          Routes. player/[region]/[riotId]/ is the player page;
                  .../match/[matchId]/ under it is the match analysis page
                  and .../insights/ the trends across the last 20 games
src/components/   React components; ui/ holds small shared pieces
src/lib/          Plain TypeScript helpers, most with a .test.ts next to them
src/lib/riot/     Server-only Riot client (rate limits, retries) and one function per endpoint
src/lib/analyzer/ Pure match analyzer: trims timelines, finds the opponent, turning points, deaths,
                  and trends.ts rolls games up into the Insights page
src/lib/match-store.ts  Loads matches and timelines from Postgres, falling back to Riot
src/db/           Drizzle schema, connection, and cache freshness rules
scripts/          Command-line jobs run with tsx (npm run benchmarks)
drizzle/          Generated SQL migrations (never edit by hand)
docs/             Design and research docs
```

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server at http://localhost:3000 |
| `npm run lint` | ESLint |
| `npm run typecheck` | Next.js type generation + `tsc` |
| `npm test` | Vitest unit tests |
| `npm run build` | Production build |
| `npm run db:generate` / `db:migrate` | Create / apply a migration after editing `src/db/schema.ts` |
| `npm run benchmarks` | Collect Challenger games for Insights' comparisons ([docs/database.md](docs/database.md#benchmark-games)) |

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs lint, typecheck, test and build on every PR. **Run all four locally before pushing.**

## Environment

Copy `.env.example` to `.env.local` (git-ignored). Variables, names only:

- `RIOT_API_KEY`: dev keys expire every 24 hours; regenerate at developer.riotgames.com
- `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`
- `DATABASE_URL` (transaction pooler, port 6543), `DATABASE_URL_DIRECT` (session pooler, port 5432, migrations only)

Production values live in Vercel's environment variables, which Jasper sets himself.

## Design

Dark "scouting report" style. Tokens live in `src/app/globals.css`: **blue = you / ahead / win, amber = opponent / behind / loss** (chosen over green/red for color-blind players). Reuse the tokens (`bg-surface`, `text-muted`, `text-ahead`...) instead of raw colors. Approved mockups: https://claude.ai/artifact/2yuQ2qLhDpjqX5SMLubpDr (only viewable from Jasper's account).

## Code rules

- **Riot calls and database access stay on the server.** Modules that touch the API key or `DATABASE_URL` import `"server-only"`.
- Every Riot request goes through the rate-limited client in `src/lib/riot/client.ts`.
- Finished matches and timelines are cached forever; only rank and match lists expire (see `src/db/freshness.ts`).
- Keep the analyzer as pure functions (match JSON in, results out) with Vitest tests.
- Write comments that explain *why* in plain language, matching the existing code.

## Working conventions

- **Never commit secrets.** No keys, tokens or connection strings in code, docs, commits or PR text.
- **Small PRs**, one topic each, on a branch. Never push to `main`.
- **Jasper merges every PR himself** after reading it. Claude never merges, and waits for CI and the Vercel check to pass.
- **Every PR description has a plain-language walkthrough**: what changed, why, and how to try it, written for someone new to the codebase.
- At most two branches in progress at once, touching different files.
- **Merge conflicts:** merge `main` into the branch (don't rebase shared branches). For `package-lock.json`, take `main`'s version and re-run `npm install`.
- `next dev` may re-add a block to `AGENTS.md`; committing it is fine.

## Keeping this file current

Update this file in the same PR whenever a change makes it wrong: a new command, env var, folder, convention or major decision. Keep it under about 100 lines; link to `docs/` for detail instead of copying it here. Jasper can also ask Claude to "update CLAUDE.md" with a new rule.
