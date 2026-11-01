# Setting up Turnpoint on a new computer

Everything you need to go from a fresh machine to the site running at http://localhost:3000. The short version is in the [README](../README.md#getting-started); this page explains each step.

## Requirements

| What | Version | Needed for | Get it |
|---|---|---|---|
| **Git** | any recent | Cloning the repo, committing | https://git-scm.com/downloads |
| **Node.js** | **22** (the version CI and Vercel use) | Running and building the app; comes with `npm` | https://nodejs.org (pick version 22) |
| **A code editor** | any | Editing code | [VS Code](https://code.visualstudio.com) is a good default |
| **A Riot API key** | free development key | Every player and match lookup | https://developer.riotgames.com |
| Supabase Postgres | | The match cache and rank benchmarks (optional locally) | https://supabase.com |
| Claude Code | | Optional: local Claude sessions in this repo | https://claude.ai/code |

The Node version is written down in two places so tools can check it:

- [`.nvmrc`](../.nvmrc) says `22`. CI reads it, and so do version managers like `nvm` and `fnm` (`nvm use` switches to it).
- `"engines"` in [`package.json`](../package.json) says `22.x`. `npm install` prints an `EBADENGINE` warning on any other version, and Vercel builds with it.

Check what you have with:

```bash
git --version
node --version   # should print v22.something
npm --version
```

## 1. Get the code

```bash
git clone https://github.com/Jaspyplayz/League-Web-App.git
cd League-Web-App
npm install
```

`npm install` reads `package-lock.json`, so you get exactly the same package versions as everyone else.

## 2. Fill in `.env.local`

The app reads its secrets from a file called `.env.local`. It's listed in `.gitignore`, so it never gets committed and **never comes with the clone**: copy the values over yourself (a password manager or USB stick, not chat or email).

Start from the template:

```bash
cp .env.example .env.local      # macOS, Linux, or Windows PowerShell
copy .env.example .env.local    # Windows Command Prompt
```

Then fill in each line:

| Variable | Required locally? | Where it comes from |
|---|---|---|
| `RIOT_API_KEY` | **Yes** | The [Riot developer portal](https://developer.riotgames.com). Development keys expire every 24 hours; regenerate one when lookups start failing. |
| `DATABASE_URL` | No, but recommended | Supabase dashboard → **Connect** → **Transaction pooler** (port `6543`). Without it, every page asks Riot directly and the rank comparisons on Insights are empty. |
| `DATABASE_URL_DIRECT` | Only for `npm run db:migrate` | Same **Connect** dialog → **Session pooler** (port `5432`). |
| `NEXT_PUBLIC_SENTRY_DSN` | No | The Sentry project's settings ("Client Keys (DSN)"). Leave empty to skip error reporting while developing. |
| `SENTRY_AUTH_TOKEN` | No | Only the Vercel build uses it, to upload source maps. Leave empty locally. |

Use the **pooler** connection strings, not Supabase's "Direct connection": on the free tier that one is IPv6-only, which many home networks can't reach. More on the database in [database.md](database.md#setup).

## 3. Set up the database (optional)

If you filled in `DATABASE_URL_DIRECT`, bring the database up to date:

```bash
npm run db:migrate
```

It applies any migration in `drizzle/` the database hasn't seen yet, and does nothing if it's already current. Run it again whenever you pull a change that adds a file to `drizzle/`.

## 4. Run it

```bash
npm run dev
```

Open http://localhost:3000 and search for any Riot ID, like your own.

## 5. Before you push

CI runs these four on every pull request; run them yourself first:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## The browser smoke test

After Vercel deploys a pull request's preview, GitHub runs `e2e/smoke.spec.ts` against it (workflow `.github/workflows/smoke.yml`): it searches Hide on bush#KR1, opens the sample analysis, searches from the header on it, and switches to light mode with the header's theme button. When the Riot key has expired, the search half is skipped, not failed. The same run does an accessibility scan (`e2e/accessibility.spec.ts`) of home, the player page and the sample analysis's Summary tab in both themes, plus its Replay and Stats tabs and the not-found page in dark mode, and the phone header with its menu open in both. It lists what it finds on the run's summary page, and any finding fails the run. The player page scan is skipped like the search when the key has expired. `e2e/mcp.spec.ts` asks the MCP server at `/api/mcp` for its tool list and fails unless exactly its three tools come back, or if the route takes more than 15 seconds to answer ([mcp.md](mcp.md#how-it-works)). To run them yourself against a preview:

```bash
npx playwright install chromium
BASE_URL=https://your-preview.vercel.app npm run test:e2e
```

If Vercel's preview protection is on (Vercel project → Settings → Deployment Protection), the test needs a way in: create a "Protection Bypass for Automation" secret there and save it in GitHub (repository → Settings → Secrets and variables → Actions) as `VERCEL_AUTOMATION_BYPASS_SECRET`. The test sends that secret only to the preview, never to the other sites a page loads from, such as Data Dragon and Sentry. `e2e/fixtures.ts` adds it, so a new spec imports `test` from there. The one exception is `e2e/mcp.spec.ts`: it opens no page, only sends requests to the preview with Playwright's `request` fixture, so it adds the header to those requests itself and follows no redirects. The same fixture fails any test whose requests took the secret to another site, which a redirect off the preview would do, so a test that leaves the preview (sign-in, for example) needs another way in ([decision record 0006](adr/0006-bypass-secret-only-to-preview.md)). CI still never keeps Playwright traces (they record the headers sent to the preview); a failed run uploads screenshots instead. If the secret ever ends up somewhere public, make a new one in Vercel and replace the GitHub secret.

For a pull request's screenshots, `npm run shot -- --pr <number> <path>` opens that PR's preview and saves the page to `.cache/verify/` (the [verify skill](../.claude/skills/verify/SKILL.md) has the options). It reads the same secret from `.env.local`, so put it there too, and sends it only to the preview itself. Without it, the run stops at Vercel's login and says so.

The sample analysis is read from the database, so `DATABASE_URL` in Vercel (Settings → Environment Variables) must be set for **Preview** as well as Production. Without it the preview tries Riot instead and the test fails once the key expires. After changing a variable, push a commit or redeploy the preview so it picks up the change.

## Optional: collect rank benchmarks

The "You vs [rank]" comparisons on Insights need sample games from other players. `npm run benchmarks` collects them into the database using your `RIOT_API_KEY` and `DATABASE_URL`. A full run takes about 2 hours, so start small:

```bash
npm run benchmarks -- --regions na --tiers gold --players 2
```

Details are in [database.md](database.md#benchmark-games).

## Windows notes

**"running scripts is disabled on this system".** PowerShell blocks `npm` (which is a script there) by default. Allow scripts you've installed yourself, once, in PowerShell:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Then close and reopen the terminal.

**Arguments after `--` go missing.** PowerShell swallows the `--` that passes options through npm to a script. Type `npm.cmd` instead of `npm` for those commands:

```powershell
npm.cmd run benchmarks -- --regions na --tiers gold --players 2
```
