# Turnpoint functional verification map

This directory is the maintained source for verifying that Turnpoint's player-facing features work. Read this index before driving the app, then use the matching feature file as the recipe. UX journeys (calm flows, teasers, the review path, phone layout) live in the sibling skill `verify-turnpoint-ux`.

## Baseline preconditions

- Pick the target from the journey's `needs:` (see the SKILL.md table): local dev server from `launch.ts` at `http://127.0.0.1:3100`, the live site `https://league-web-app.vercel.app`, or a PR preview with `VERCEL_AUTOMATION_BYPASS_SECRET` set.
- Run `npx tsx .claude/skills/verify-turnpoint/scripts/doctor.ts [--base <url>]` and require `home page ok` plus `ok` on every capability the journey needs. For a local target also require `alive, so the port is ours`.
- Test player `Hide on bush#KR1` on region `kr` (profile `/player/kr/Hide%20on%20bush-KR1`). Sample game `KR_8416261221` (`/player/kr/Hide%20on%20bush-KR1/match/KR_8416261221`), stored in the database, so it works even when the Riot key has expired.
- Signed out. Every journey uses a fresh browser context (no cookies, no localStorage).
- Never drive a local server that `launch.ts` didn't start, and never port 3000.

## Driving conventions

- Drive through `npx tsx .claude/skills/verify-turnpoint/scripts/drive.ts [--base <url>] [--run <id>] <journey>`. Each feature file names its journey.
- Prefer ARIA roles and accessible names (`getByRole`, `getByLabel`) over CSS classes or position. Turnpoint's visual style will change (Soft Rounded is planned); its labels and regions should not.
- Headings render uppercase through CSS (`text-transform`), so `innerText` is uppercase. Match accessible names, or match text case-insensitively.
- Type and click the way a player does. Go straight to a URL only when the recipe's entry point is a pasted link.
- Wait for a role or URL, not a fixed sleep. Cold dev compiles and Riot lookups take up to ~45 s.
- These journeys are read-only. Nothing to restore.

## Proof and skip reporting

- Each step saves `NN-<step>.png`, `NN-<step>.aria.yml` (ARIA snapshot of `<main>`), and a line in `steps.jsonl` under `.cache/verify-turnpoint/<run id>/<journey>/`. `result.json` holds pass/fail, notes (counts, headings), and uncaught page errors.
- Capture the user action and the resulting state, not only the final screen.
- Record the target URL and commit (`run.json`) with every artifact you hand over.
- A page that shows "The site's Riot API key isn't working", the Vercel login, an error page, or a not-enough-data notice is a FAIL with that reason. Do not report it as verified.
- Report an unreachable feature with the doctor line that failed and the target you tried.
- Do not report a skipped entry point as verified through a different one.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with drive.ts` starts with `Preconditions:` and uses labeled bullets that pair each user action with the exact handle and observable result.
4. `Gotchas` lists traps that can waste or invalidate a run.

Keep implementation details out of the map. Name only user paths, stable handles, required state, commands, and observable proof.

## Features

- [Home Riot ID lookup](./home-lookup.md) covers typing a Riot ID and region on the home page and landing on that player's profile. Journey `home-lookup`.
- [Profile match list](./profile-matches.md) covers the profile's rank card, Recent matches rows, and queue filter. Journey `profile-matches`.
- [Match Summary 60-second review](./match-review.md) covers the match page Summary tab and its 1–3 review moments. Journey `match-review`.
- [Insights: You vs others](./insights-others.md) covers the rank benchmark card and the compare forms. Journey `insights-others`.
- [Signed-out Ask teaser](./ask-teaser.md) covers what a signed-out visitor sees on the Ask tab. Journey `ask-teaser`.
