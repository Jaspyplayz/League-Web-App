---
name: verify-turnpoint
description: Drive Turnpoint (the League of Legends match-analysis Next.js web app in this repo) in headless Chromium and save step-by-step proof that its functional UI works — home Riot ID lookup, profile match list, match Summary 60-second review, Insights "You vs others", signed-out Ask teaser. Use before calling a player-visible change done, to reproduce a UI bug, or to check the live site / a PR preview / a local dev server. For UX-journey checks (calm flows, teasers, review path) use the sibling skill verify-turnpoint-ux.
---

# Verify Turnpoint (functional)

Everything runs from the repo root. The harness is plain Playwright (`@playwright/test`, already a devDependency) run through `tsx`, not the Playwright test runner. Each journey is a list of user steps; every step saves a screenshot, an ARIA snapshot of `<main>`, and a JSON line, and the first failed expectation stops the journey.

The feature map is [features/README.md](features/README.md). Read it, then the feature file you are proving.

The repo also has `npm run shot` and its skill, `.claude/skills/verify/`. It saves one full-page screenshot per URL and does not click or type. Use this skill when the proof needs a user action and the resulting state.

## Pick the target

Turnpoint's data pages need secrets a fresh checkout doesn't have. Pick the target from the journey's `needs:` (`drive.ts --list` prints it):

| Target | How | What works |
|---|---|---|
| Local dev server, no `.env.local` | `launch.ts` (default `http://127.0.0.1:3100`) | `needs: nothing` only: home page, search form validation, Settings. Every data page shows "The site's Riot API key isn't working". |
| Local dev server with `.env.local` | same; `.env.local` must hold `RIOT_API_KEY`, `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `ANTHROPIC_API_KEY` (see `.env.example`) | everything. Never copy secrets into the repo or a worktree; Jasper owns `.env.local`. |
| Live site | `--base https://league-web-app.vercel.app` | everything, as `main` shows it now. Read-only journeys only. A "before" for a change. |
| PR preview | `--pr <number>` | everything, for that PR. Like `npm run shot`, the scripts find the preview through GitHub and get past Vercel's login with `VERCEL_AUTOMATION_BYPASS_SECRET`, read from the environment or else `.env.local` (a worktree falls back to the main checkout's). They send the secret only to the preview `--pr` found (`e2e/preview-login.ts`), never to a `--base` URL, so `--base <preview>` shows `vercel-login`. Without the secret every page is `vercel-login`; only Jasper can add it. |

## Launch

```bash
npx tsx .claude/skills/verify-turnpoint/scripts/launch.ts          # port 3100
npx tsx .claude/skills/verify-turnpoint/scripts/launch.ts 3101     # another port
```

- Needs `node_modules`, so run `npm ci` once in a fresh checkout. A worktree needs its own install: with `node_modules` linked to another checkout, Turbopack stops with "Could not find the Next.js package" and the home page never renders. Starts `next dev -p <port> -H 127.0.0.1` in the background, in its own process group on Linux and macOS. It works the same on Windows, from PowerShell or Git Bash.
- Ready = the log says `Ready in` AND `GET /` returns HTML containing "Find the minute" (the first request compiles the page; ~10 s on the box). It prints `ready: http://127.0.0.1:3100 (pid …, log .cache/verify-turnpoint-server/dev-3100.log)`.
- State goes to `.cache/verify-turnpoint-server/instance.json` in the checkout (git-ignored); `drive.ts` and `doctor.ts` use its `base` when you pass no `--base`.
- Refuses port 3000 (may be Jasper's own server), a port someone else holds, and a second launch while the server it started earlier still runs.
- No database migrations or seed step: the app reads Supabase Postgres through `DATABASE_URL`; the sample game `KR_8416261221` already lives there. Never run `npm run db:migrate`.
- Isolation: one dev server per checkout (`next dev` locks `.next/dev`). For two side-by-side instances use two git worktrees, each with its own port. Remote targets (live, preview) need no launch and can be driven in parallel.
- Playwright's Chromium: if a run says the browser is missing, run `npx playwright install chromium` once.

## Doctor

Read-only. Run it first, and again whenever anything looks off:

```bash
npx tsx .claude/skills/verify-turnpoint/scripts/doctor.ts                                   # the launched instance
npx tsx .claude/skills/verify-turnpoint/scripts/doctor.ts --base https://league-web-app.vercel.app
npx tsx .claude/skills/verify-turnpoint/scripts/doctor.ts --pr 155                          # that PR's preview
```

It prints the checkout commit, then for a local target whether the server in the state file is still running. While it runs, the port is ours, because `next dev` exits when its port is taken. "NOT OURS" means don't drive it. Then one line per capability:

```
home page            [needs: nothing]  ok
sample game          [needs: database] ok | riot-key
player profile       [needs: riot]     ok | riot-key
signed-out Ask       [needs: supabase] ok | missing "to ask questions" ...
```

Exit 0 = the home page is the app. A journey whose `needs:` line isn't `ok` will fail; drive it on another target instead of weakening it. `riot-key` on the live site/preview means the development Riot key expired (every 24 h) — only Jasper renews it; the sample game (database) still works.

## Drive

```bash
npx tsx .claude/skills/verify-turnpoint/scripts/drive.ts --list
npx tsx .claude/skills/verify-turnpoint/scripts/drive.ts [--base <url> | --pr <number>] [--run <id>] <journey...|all>
# e.g.
npx tsx .claude/skills/verify-turnpoint/scripts/drive.ts --base https://league-web-app.vercel.app match-review
```

| Journey | needs | Feature file |
|---|---|---|
| `home-lookup` | riot | [features/home-lookup.md](features/home-lookup.md) |
| `profile-matches` | riot, database | [features/profile-matches.md](features/profile-matches.md) |
| `match-review` | database | [features/match-review.md](features/match-review.md) |
| `insights-others` | riot, database | [features/insights-others.md](features/insights-others.md) |
| `ask-teaser` | riot, supabase | [features/ask-teaser.md](features/ask-teaser.md) |

Handles the journeys use (all from the source, stable across restyles such as the planned Soft Rounded look): `role=search name="Player lookup"`, labels `Riot ID` / `Region`, button `Analyze`, `navigation "Profile sections"`, `region "Recent matches"`, `tablist "Match analysis"` with tabs `Summary` / `Deep dive`, `region "60-second review"`, `navigation "Insights views"`, `region /^You vs /`, `form "Compare with a rank"`, `region "Compare with a player"`. Test player: `Hide on bush#KR1` on KR → `/player/kr/Hide%20on%20bush-KR1`. Sample game: `/player/kr/Hide%20on%20bush-KR1/match/KR_8416261221`.

To add a journey: add an entry to `journeys` in `scripts/drive.ts` (each `step(name, act)` is one user action plus its expectations, written with `page.getByRole/getByLabel` and Playwright `expect`), add or update its feature file, and run it once.

Exit code 0 = every journey passed; 1 = at least one failed (the failing step and the page's reason are printed and saved).

## Evidence

Location (git-ignored, survives cleanup): `.cache/verify-turnpoint/<run id>/`

```
<run id>/run.json                       target, commit, whether src/ is dirty, start time
<run id>/<journey>/NN-<step>.png        viewport screenshot after the step
<run id>/<journey>/NN-<step>.aria.yml   ARIA snapshot of <main> after the step
<run id>/<journey>/steps.jsonl          one line per step: url, ms, ok, error
<run id>/<journey>/result.json          pass/fail, feature file, notes (counts, headings), uncaught page errors
```

`--run <id>` names the folder (default: an ISO timestamp). Proof standards:

- Exercise the real user path: type into the form and press `Analyze`, click the tab, follow the link. Navigating straight to a URL is fine only when that is how a player arrives (a pasted link) and the feature file says so.
- Capture the action and the resulting state: the step screenshots form a before/after sequence; the ARIA snapshot proves roles and names a screenshot can't.
- A page that loaded is not proof. The journey's expectations (row counts, `aria-selected`, `aria-current`, hrefs) are the proof; read `result.json` notes and look at the last screenshot before reporting.
- `riot-key`, `vercel-login`, an error page, or a not-enough-data notice is a FAIL with that reason, never a pass. Report it with the target.
- Side effects: these functional journeys are read-only. Searching adds the player to the browser's localStorage "Recent" list only (a fresh context each run, so nothing persists). Nothing is written server-side except Riot lookups being cached in the database by the app itself.
- No mocks: Riot, Supabase and the database are real on every target.
- Name the target with every screenshot you hand over; a live-site screenshot proves nothing about an unmerged branch.

## Cleanup

```bash
npx tsx .claude/skills/verify-turnpoint/scripts/cleanup.ts
```

Stops only the server `launch.ts` recorded and its children: its process group on Linux and macOS (TERM, then KILL after 10 s), its process tree on Windows (`taskkill /T /F`). It first checks that the recorded PID still runs this checkout's `next dev` on the recorded port. When it doesn't, the server died without cleanup and the PID may belong to another process now, so it stops nothing and says `nothing stopped`. Then it removes the state file and dev log, checks the port is free, and lists the kept evidence folders. Never `pkill node` / kill by name: Jasper's server and other agents' servers are `node` too. It never touches `.cache/verify-turnpoint/`. Run it after every failed attempt as well. Remote targets need no cleanup.

## Helpers

All under `.claude/skills/verify-turnpoint/scripts/`, run from the repo root:

| Helper | Invocation | Does |
|---|---|---|
| `launch.ts` | `npx tsx .claude/skills/verify-turnpoint/scripts/launch.ts [port]` | starts and waits for our dev server |
| `doctor.ts` | `npx tsx .claude/skills/verify-turnpoint/scripts/doctor.ts [--base <url>]` | read-only health + capability check |
| `drive.ts` | `npx tsx .claude/skills/verify-turnpoint/scripts/drive.ts [--base <url> | --pr <number>] [--run <id>] <journey…\|all>` | runs functional journeys, writes evidence |
| `runner.ts` | imported by both skills' `drive.ts` | browser, preview bypass, step recorder, evidence layout |
| `cleanup.ts` | `npx tsx .claude/skills/verify-turnpoint/scripts/cleanup.ts` | stops our dev server, keeps evidence |

Keep the map honest as the app changes with `/maintain-verification-skill`.
