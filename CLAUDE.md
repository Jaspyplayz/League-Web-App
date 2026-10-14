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
- Game score (the trained 0 to 100 rating): [docs/game-score.md](docs/game-score.md)
- Win chance (each team's chance to win at every minute): [docs/win-chance.md](docs/win-chance.md)
- Requirements and setup on a new computer: [docs/SETUP.md](docs/SETUP.md)

## Stack

Next.js 16 (App Router) + TypeScript, Tailwind CSS 4, Supabase Postgres via Drizzle ORM, Riot Games API, Sentry, Vitest, GitHub Actions, Vercel. Node 22, pinned in `.nvmrc` and `package.json` `engines`.

## Layout

```
src/app/          Routes. player/[region]/[riotId]/ is the player page;
                  .../match/[matchId]/ under it is the match analysis page
                  and .../insights/ the trends across the last 20 to 100 games
src/components/   React components; ui/ holds small shared pieces
src/lib/          Plain TypeScript helpers, most with a .test.ts next to them
src/lib/riot/     Server-only Riot client (rate limits, retries) and one function per endpoint
src/lib/analyzer/ Pure match analyzer: trims timelines, finds the opponent, turning points, deaths,
                  trends.ts rolls games up into the Insights page, compare.ts
                  sets them against one rank's games or one chosen player's,
                  score.ts is the trained 0 to 100 game score (score-model.json)
                  and win-chance.ts each team's chance to win at every minute
src/lib/match-store.ts  Loads matches and timelines from Postgres, falling back to Riot
src/lib/profile-store.ts  A player's saved profile (rank, latest match IDs) and its Update button;
                  each save also adds changed ranks to rank_history for the LP graph
src/lib/trend-games.ts  A player's recent games summarized for Insights, a few timelines per view
src/lib/season-store.ts Season champion stats; loads the season's games 10 per profile visit
src/db/           Drizzle schema, connection, and cache freshness rules
src/lib/supabase/ Supabase Auth clients (sign-in with Google and Discord); src/proxy.ts keeps sign-ins fresh
scripts/          Command-line jobs run with tsx (benchmarks, train-score, train-win-chance)
drizzle/          Generated SQL migrations (never edit by hand)
docs/             Design and research docs
.claude/          Claude Code settings; hooks/ runs lint and typecheck before Claude commits
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
| `npm run benchmarks` | Collect games from every rank for Insights' comparisons ([docs/database.md](docs/database.md#benchmark-games)) |
| `npm run train-score` | Retrain the game score on saved games and update `score-model.json` ([docs/game-score.md](docs/game-score.md)) |
| `npm run train-win-chance` | Train the win chance model on saved games and write `win-chance-model.json` ([docs/win-chance.md](docs/win-chance.md)) |

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs lint, typecheck, test and build on every PR. **Run all four locally before pushing.** A Claude Code hook ([.claude/settings.json](.claude/settings.json)) blocks Claude's commits until lint and typecheck pass.

## Environment

Copy `.env.example` to `.env.local` (git-ignored). Variables, names only:

- `RIOT_API_KEY`: dev keys expire every 24 hours; regenerate at developer.riotgames.com
- `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`
- `DATABASE_URL` (transaction pooler, port 6543), `DATABASE_URL_DIRECT` (session pooler, port 5432, migrations only)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: sign-in; without them "Sign in" is hidden ([docs/sign-in.md](docs/sign-in.md))

Production values live in Vercel's environment variables, which Jasper sets himself.

## Design

Dark "scouting report" style. Tokens live in `src/app/globals.css`: **blue = you / ahead / win, amber = opponent / behind / loss** (chosen over green/red for color-blind players). Reuse the tokens (`bg-surface`, `text-muted`, `text-ahead`...) instead of raw colors. Views of both teams (scoreboards, Team analysis) color the winning team blue and the losing team amber, with your row outlined. Where two numbers sit side by side, write the gap in words with `ui/gap.tsx` ("614 behind"). Cards use `ui/panel.tsx`; text sizes stick to Tailwind's plus `text-label`, `text-note` and `text-body`. Approved mockups: https://claude.ai/artifact/2yuQ2qLhDpjqX5SMLubpDr (only viewable from Jasper's account).

## Code rules

- **Riot calls and database access stay on the server.** Modules that touch the API key or `DATABASE_URL` import `"server-only"`.
- Every Riot request goes through the rate-limited client in `src/lib/riot/client.ts`.
- Finished matches and timelines are cached forever; a player's profile (rank, match list) expires after a day or on "Update" (see `src/db/freshness.ts`).
- Keep the analyzer as pure functions (match JSON in, results out) with Vitest tests.
- Write comments that explain *why* in plain language, matching the existing code.
- `/privacy` and `/terms` are what Riot reviews for production keys and Riot sign-in. A change that stores new data (accounts, analytics, cookies) updates `src/app/privacy/page.tsx` in the same PR.

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
