# Status

Where Turnpoint is right now: what's being worked on, what just shipped and what comes next. The Cursor chat updates this file after each merge (step 12 in [docs/workflow.md](workflow.md#the-steps-for-a-normal-change)), so a pull request can leave it alone. Anything marked "(check with Jasper)" wasn't clear from the repo; ask him instead of guessing.

## Last updated

2026-10-22

## Current focus

**Fixes from the full codebase audit** (2026-10-21). Jasper picked the top 8 findings, fixed in order with at most two PRs open at once. Fixes 1 and 2 are merged (#140, #142). In progress:

- **#144**, branch `claude/project-thread-i05x90-crawlers`: lets link preview bots (Discord, X, LinkedIn) open a pasted match link, and tidies what the reviewer found in #142. Ready for Jasper to read and merge.
- **#146**, branch `claude/project-thread-i05x90-ask-budget` (fix 3, issue #143): makes Ask's daily cap and monthly budget hold when several questions arrive at once, and adds a $5 a month cap per account. Its migrations (0019 and 0020) have been run on the database; it waits on Jasper to try the preview and merge. (check with Jasper)
- **This file**, branch `claude/project-thread-fr29qs`.

**Loading skeletons (#20)**: Jasper writes these himself, with Claude only coaching. The profile's match list is done (#94); the Insights page's `loading.tsx` is left.

## Recently shipped

- **#160** Games saved before the Riot key change show on profiles again. On 2026-10-25 a one-off script moved them, with their ranks and recaps, to the new key's PUUIDs, and the benchmarks were collected again ([docs/database.md](database.md#when-the-riot-key-changes)).
- **#142** Crawlers can't spend the Riot allowance on player pages: `robots.txt` asks them to skip `/player/` and `/api/`, and only the plain profile page loads more season games.
- **#140** The preview bypass secret is no longer saved in CI's uploaded Playwright traces.
- **#139** "What keeps killing you" on Insights: the champions and abilities in most of your deaths, and the damage type.
- **#137** Light-mode text darkened to pass contrast, and the accessibility scan now fails a PR that breaks it.
- **#136** The after-merge step added to the workflow doc.
- **#135** Workflow phase 3: shared skills, `.claude/rules` path rules, golden tests on four real games, dependency review and an accessibility scan.
- **#134** Threads in the Claude app can start the `/explain-back` quiz.
- **#133** The review loop: a reviewer agent, `/explain-back`, and PR and issue templates.
- **#131** The Deep dive tab tightened: replay first, one table, one jungle panel.
- **#130** The Summary tab laid out as one shared timeline.

## Next up

- **The rest of the audit's top 8**, in order:
  4. Only analyze Summoner's Rift games (#145): ARAM games are drawn on the wrong map and Arena games crash. Starts once #144 or #146 merges.
  5. A bot-lane solo death names the wrong champion (`turning-points.ts`).
  6. A failed note read erases the note.
  7. Visiting a player on the wrong region overwrites their profile.
  8. The Riot client doesn't retry when reading a response body fails (`src/lib/riot/client.ts`).
- **The site in Korean, Spanish and Portuguese**, once no other branch is editing pages.
- **Ideas from the model research** (`model-research.md` in the project's shared files): Jasper picks which of its three recommendations become PRs. (check with Jasper)
- **Self-experiments**, the next feature idea pitched. (check with Jasper)
- **Sign in with your Riot account** (#40), once a production Riot key is approved.

Jasper's own to-dos: Riot API key that doesn't expire (#17, personal key applied for 2026-10-20), custom domain (#22), decision records (#16), the Insights loading skeleton (#20), and a short retro on the review loop.

## Known issues

- **Riot dev key expires every 24 hours** until the personal key is approved (#17), and the rate limits in `RIOT_LIMITS` are set for a dev key.
- **Vercel bypass secret**: it was in Playwright traces uploaded by failed smoke runs before #140, and the smoke test sent it to Data Dragon and Sentry until #159. Rotating the secret (once every branch in progress has merged `main`) and deleting the old trace artifacts is on Jasper. (check with Jasper whether this is done)
- **`/api/mcp` has no request limit**, so an AI app looking up many new players could use up the Riot allowance ([ARCHITECTURE.md](../ARCHITECTURE.md#known-limits)).
- **Crawlers are only asked to stay out.** Rude crawlers ignore `robots.txt`; Vercel's bot protection would be the next step.
- **One free database**: Supabase's free tier holds 500 MB and has no downloadable backups.
- **No uptime check**: nothing alerts when the site is down or the dev key has expired.
- **Ask has no time limit on Claude's loop**: with #146, a question cut off at 180 seconds keeps its 50-cent hold even if it cost more. Known and left for a later issue.
- **Death recaps**: only games whose timeline was downloaded after #139 have them, and whether Riot reports pets under their owner hasn't been checked on a real game ([docs/death-recaps.md](death-recaps.md#limits)).
- **The audit's other findings**: 82 in all (1 high, 15 medium, 66 low), most outside the top 8, in the audit report (`audit/` in the project's shared files).
- **Two stale branches**: `claude/personal-records-fophx6` (personal records, dropped when #132 was closed) and `claude/project-thread-vo5l5f` (already merged as #121) can be deleted. (check with Jasper)
