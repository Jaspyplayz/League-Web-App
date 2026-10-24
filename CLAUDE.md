# CLAUDE.md

Context and rules for Claude Code sessions working in this repo, on Jasper's computer or in the cloud.

@AGENTS.md

## What this is

**Turnpoint** is a League of Legends stats site: look up a player by Riot ID, then see each game broken down minute by minute against the enemy in the same role, with the turning points explained. The match analyzer is the standout feature.

It's a portfolio project for Jasper (a second-year UofT student, new to TypeScript and React) to help land a software internship. Code and PRs should be easy for him to read and explain in an interview.

- Live site: https://league-web-app.vercel.app (Vercel auto-deploys `main`; every PR gets a preview)
- How the pieces fit together, with diagrams: [ARCHITECTURE.md](ARCHITECTURE.md)
- Scope and data model: [docs/SCOPE.md](docs/SCOPE.md)
- Analyzer research: [docs/match-analyzer.md](docs/match-analyzer.md)
- Database tables and setup: [docs/database.md](docs/database.md)
- Game score (the trained 0 to 100 rating): [docs/game-score.md](docs/game-score.md)
- Phase ratings (early, mid and late game, 0 to 100, on the match page): [docs/phase-ratings.md](docs/phase-ratings.md)
- Win chance (each team's chance to win at every minute): [docs/win-chance.md](docs/win-chance.md)
- AI match recaps (Claude writes a few sentences from the analyzer's numbers): [docs/match-recap.md](docs/match-recap.md)
- Habits (level 6 first, first scuttles, early ganks and first back on Insights, with how often games with them were won): [docs/habits.md](docs/habits.md)
- Session blocks (win rate and game score by how many games you played in a row, on Insights): [docs/sessions.md](docs/sessions.md)
- Death recaps added up ("What keeps killing you" on Insights: the champions and abilities in most of your deaths, and the damage type): [docs/death-recaps.md](docs/death-recaps.md)
- Tempo timeline (beta: which jungler had the time advantage at every second, and the study that checks it): [docs/tempo.md](docs/tempo.md)
- Replay (beta: the whole game second by second, with every player's items and spot on the map, every play graded by the win chance, and the checks behind them): [docs/replay.md](docs/replay.md)
- 60-second review (the three plays you were in that moved the win chance most, on the match page's Summary tab, each a question to think over and a jump into the replay): [docs/review.md](docs/review.md)
- Ask (signed-in players ask Claude about a player's games; Claude reads them with the MCP tools, 10 questions a day, $5 a month per account and $20 for the site): [docs/ask.md](docs/ask.md)
- MCP server (Claude and other AI apps can look players up and read the analyzer's results at `/api/mcp`): [docs/mcp.md](docs/mcp.md)
- Requirements and setup on a new computer: [docs/SETUP.md](docs/SETUP.md)
- How a change gets made (review tiers, the reviewer agent, "My read"): [docs/workflow.md](docs/workflow.md)
- Current status and next steps: [docs/STATUS.md](docs/STATUS.md)

## Stack

Next.js 16 (App Router) + TypeScript, Tailwind CSS 4, Supabase Postgres via Drizzle ORM, Riot Games API, Claude API (Haiku for recaps, Sonnet for Ask), Sentry, Vitest, GitHub Actions, Vercel. Node 22, pinned in `.nvmrc` and `package.json` `engines`.

## Layout

Routes live in `src/app/`, React components in `src/components/` and helpers in `src/lib/`, most with a `.test.ts` next to them (the pure match analyzer is `src/lib/analyzer/`, the server-only Riot client `src/lib/riot/`). The Drizzle schema is in `src/db/`, generated migrations in `drizzle/`, command-line jobs in `scripts/` and docs in `docs/`. The file-by-file map is in [ARCHITECTURE.md](ARCHITECTURE.md#where-the-code-lives).

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server at http://localhost:3000 |
| `npm run lint` | ESLint |
| `npm run typecheck` | Next.js type generation + `tsc` |
| `npm test` | Vitest unit tests, including golden tests on four real games (`src/lib/analyzer/golden.test.ts`) |
| `npm run test:e2e` | Playwright smoke test and accessibility scan (`e2e/`); runs on each Vercel preview ([docs/SETUP.md](docs/SETUP.md#the-browser-smoke-test)) |
| `npm run shot -- --pr <number> <path>` | Screenshot a page on a PR's preview (or `--base` the live site or a dev server) into `.cache/verify/`, for a PR's evidence. Agents use it through the `verify` skill ([.claude/skills/verify/SKILL.md](.claude/skills/verify/SKILL.md)) |
| `npm run build` | Production build |
| `npm run db:generate` / `db:migrate` | Create / apply a migration after editing `src/db/schema.ts` |
| `npm run benchmarks` | Collect games from every rank for Insights' comparisons ([docs/database.md](docs/database.md#benchmark-games)) |
| `npm run train-score` | Retrain the game score on saved games and update `score-model.json` ([docs/game-score.md](docs/game-score.md)) |
| `npm run train-phase-score` | Train the early, mid and late ratings on the tempo study's games and the site's, and write `phase-score-model.json` ([docs/phase-ratings.md](docs/phase-ratings.md)) |
| `npm run train-win-chance` | Train the win chance model on saved games and write `win-chance-model.json` ([docs/win-chance.md](docs/win-chance.md)) |
| `npm run tempo-games` / `study-tempo` | Download games for the tempo study into the git-ignored `.cache/tempo-study`, then print its report ([docs/tempo.md](docs/tempo.md)) |
| `npm run tempo-games -- --items` / `check-items` / `check-positions` / `rift-map` | Download games into `.cache/item-check`, then check the replay's rebuilt items against Riot's, or its map positions against Riot's snapshots, or learn the Rift's walls from them ([docs/replay.md](docs/replay.md#running-the-checks)) |

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs lint, typecheck, test and build on every PR, and [dependency review](.github/workflows/dependency-review.yml) checks new packages for known vulnerabilities. **Run all four locally before pushing.** A Claude Code hook ([.claude/settings.json](.claude/settings.json)) blocks Claude's commits until lint and typecheck pass.

## Environment

Copy `.env.example` to `.env.local` (git-ignored); production values live in Vercel's environment variables, which Jasper sets himself. Variables, names only:

- `RIOT_API_KEY`: dev keys expire every 24 hours; regenerate at developer.riotgames.com
- `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`
- `DATABASE_URL` (transaction pooler, port 6543), `DATABASE_URL_DIRECT` (session pooler, port 5432, migrations only)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: sign-in; without them "Sign in" is hidden ([docs/sign-in.md](docs/sign-in.md))
- `ANTHROPIC_API_KEY`: AI match recaps; without it "Write recap" is hidden ([docs/match-recap.md](docs/match-recap.md))
- `VERCEL_AUTOMATION_BYPASS_SECRET`: only in `.env.local` and GitHub's secrets; lets `npm run shot -- --pr` past a preview's Vercel login, and the smoke test in CI uses GitHub's copy ([docs/SETUP.md](docs/SETUP.md#the-browser-smoke-test))

## Design

Dark "scouting report" style with a light theme. **Blue = you / ahead / win, red = opponent / behind / loss**, never green and red. The full rules (tokens for both themes, panels, text sizes, the approved mockups) are in [.claude/rules/design.md](.claude/rules/design.md), which loads when Claude opens a page, a component or `globals.css`.

## Code rules

- **Riot calls and database access stay on the server.** Modules that touch the API key or `DATABASE_URL` import `"server-only"`.
- Every Riot request goes through the rate-limited client in `src/lib/riot/client.ts`.
- Rules for one area live in `.claude/rules/` and load when Claude opens a file there: [design](.claude/rules/design.md), [analyzer](.claude/rules/analyzer.md), [database](.claude/rules/database.md) and [Riot client](.claude/rules/riot.md).
- Write comments that explain *why* in plain language, matching the existing code.
- `/privacy` and `/terms` are what Riot reviews for production keys and Riot sign-in. A change that stores new data (accounts, analytics, cookies) updates `src/app/privacy/page.tsx` in the same PR.

## Working conventions

- **Never commit secrets.** No keys, tokens or connection strings in code, docs, commits or PR text.
- **Small PRs**, one topic each, on a branch. Never push to `main`.
- **Jasper merges every PR himself** after reading it. Claude never merges, and waits for CI and the Vercel check to pass.
- **Every PR description has a plain-language walkthrough**: what changed, why, and how to try it, written for someone new to the codebase. Use the sections in `.github/pull_request_template.md`; GitHub only fills them in for PRs opened on its website.
- **Review tiers.** Pick tiny, normal or risky when a thread starts and name it in the PR; normal and risky PRs get the reviewer agent (`.claude/agents/reviewer.md`) before Jasper reads them. The steps are in [docs/workflow.md](docs/workflow.md). Until a second model is set up, risky PRs say "no second review yet".
- **When sources disagree,** trust the code and live settings, then repo docs and decision records, then GitHub issues and PRs, then Jasper's Obsidian vault, project memory and the shared notes, and name the one that is out of date.
- **Leave "My read" to Jasper.** He writes it before merging normal and risky PRs and runs `/explain-back` on risky ones; never fill it in.
- **Skills** in `.claude/skills/` are general advice, most copied unchanged from other repos ([notices](.claude/skills/THIRD-PARTY-NOTICES.md)); where one disagrees with this file or `docs/workflow.md`, the repo wins. Use `doubt-driven-development` only on risky changes.
- At most two branches in progress at once, touching different files.
- **Merge conflicts:** merge `main` into the branch (don't rebase shared branches). For `package-lock.json`, take `main`'s version and re-run `npm install`.
- `next dev` may re-add a block to `AGENTS.md`; committing it is fine.

## Keeping this file current

Update this file, and the folder map in [ARCHITECTURE.md](ARCHITECTURE.md#where-the-code-lives), in the same PR whenever a change makes them wrong: a new command, env var, folder, convention or major decision. Keep it under about 100 lines; link to `docs/` for detail instead of copying it here, and put rules that matter in only one folder in `.claude/rules/`. Jasper can also ask Claude to "update CLAUDE.md" with a new rule. Update [docs/STATUS.md](docs/STATUS.md) whenever a PR finishes a focus item or changes what's next.
