---
name: verify
description: Drive Turnpoint in a real browser and save screenshots as proof, on a PR's Vercel preview, the live site or a local dev server. Use for the screenshot each acceptance criterion needs (docs/workflow.md step 7), to check a change a player can see before calling it done, or to reproduce a bug on the page where it shows.
---

# Verify Turnpoint

`npm run shot` ([scripts/shot.ts](../../../scripts/shot.ts)) opens pages in Chromium the way a player would and saves full-page screenshots to `.cache/verify/` (git-ignored). It won't save a page that isn't the app working: Vercel's login (`vercel-login`), the Riot key notice (`riot-key`), the 404 page or "No player found" (`not-found`), or an error page or alert (`error`), such as Riot's "Too many lookups right now". It prints what the page showed instead and exits with code 1. Exit code 0 means every page loaded.

In Git Bash, start every command with `MSYS_NO_PATHCONV=1`, or Git Bash turns `/settings` into `C:/Program Files/Git/settings`. PowerShell and cloud machines don't need it.

## Pick the site

- **The PR's preview, `--pr <number>`.** This is the evidence a PR needs. The preview has its own database and Riot key. The script finds the preview through GitHub and gets past Vercel's login with `VERCEL_AUTOMATION_BYPASS_SECRET`, read from `.env.local` (a worktree falls back to the main checkout's). It sends the secret only to the preview that `--pr` found, never to a `--base` URL. If every run says `vercel-login`, the secret is missing. Only Jasper can add it, so say "no preview screenshots: bypass secret not set" in the PR. Don't try another way past the login.
- **The live site, `--base https://league-web-app.vercel.app`.** What `main` shows now. Use it for a "before" screenshot.
- **A local dev server, `--base http://localhost:<port>`.** For checking work before you push. Without `--base` the script uses `BASE_URL`, then `http://localhost:3000`.

## Launch (local only)

Start your own server on a port nobody else uses, never 3000, which may be Jasper's: `npm run dev -- -p 3100`, in the background. It is ready when it prints `Ready in`.

A worktree needs its own `npm ci`. With `node_modules` linked to another checkout, Turbopack stops with "Could not find the Next.js package". A worktree also has no `.env.local`, so a server started there has no database or Riot key. The home page, How it works and the 404 page work. Pages with game data show the Riot key notice. Don't copy `.env.local` into a worktree; check those pages on the preview.

## Check before driving

```
npm run shot -- --check --pr 155
```

It loads the home page, the sample game (needs only the database) and Hide on bush's profile (needs the Riot key), and prints one line for each. Exit code 0 means the home page and the sample game loaded. `riot-key` on the profile alone means the development key has expired. It expires every 24 hours, the sample game still works, and Jasper renews the key.

## Drive and capture

```
npm run shot -- --pr 155 /how-it-works
npm run shot -- --pr 155 --light --phone /how-it-works
npm run shot -- --pr 155 --tab "Replay" "/player/kr/Hide%20on%20bush-KR1/match/KR_8416261221"
```

- `--light` and `--phone` cover the issue template's "on a phone, and in light mode" criterion. `--phone` is a Pixel 7 screen.
- `--tab <name>` clicks a tab (`role="tab"`) after the page loads. Only the match page has them.
- `--expect <outcome>` saves a page that isn't `ok` on purpose, for a PR that changes one: `--expect not-found /no-such-page` for the 404 page.
- Several paths in one run share the same options. Files are named after the site, the path and the options, such as `pr155-how-it-works-light-phone.png`, or `league-web-app-…` for the live site and `localhost-…` for a dev server, so a before and an after don't overwrite each other. `--out <dir>` changes the folder.

Search, profile sections and Insights views are plain URLs, so shoot the page an action leads to. For proof that needs a click or typing, such as a form, use the journeys in [`verify-turnpoint`](../verify-turnpoint/SKILL.md) and [`verify-turnpoint-ux`](../verify-turnpoint-ux/SKILL.md), on the preview with `--pr <number>`. A check that should run on every PR from then on goes in a Playwright test in `e2e/` that imports `test` from `./fixtures`. Run it against your dev server with `BASE_URL=http://localhost:3100 npm run test:e2e`, and the smoke test runs it on the preview after you push. Don't run `test:e2e` against a preview yourself: it doesn't read `.env.local`, so it stops at Vercel's login.

The pages, with their paths, labels and traps, are in [features/README.md](features/README.md).

## A page stuck loading in the built-in browser

Claude's built-in browser pane draws no frames while it's hidden. Until a page's first streamed section (a `<Suspense>` boundary) appears, React waits for a drawn frame to show it. So in a hidden pane a page can sit on its loading text ("Loading champions…") or grey skeleton forever, with the content already downloaded. Champions and Insights did this (JAS-91). Before calling it a bug, take a screenshot, which draws a frame, then check again. In the console, `$RB.length` above 0 with `typeof $RT` `"undefined"` means sections are waiting for a frame; `$RB is not defined` means no section has arrived from the server yet, so this isn't the cause. If the page still shows its loading text or skeleton after a screenshot, it's a real bug. `npm run shot` draws frames but takes its picture after at most 15 seconds, so a page still loading there may just be slow: shoot the same path with `--base https://league-web-app.vercel.app` and see whether the live site stalls too.

## Evidence

- One screenshot per acceptance criterion, showing the state the criterion names. A page that loaded is not proof that the criterion holds.
- A screenshot shows what a player sees. A change that saves data also needs the test, or a second visit, that shows the saved value.
- Put them in the PR with `gh pr create --attach` or `gh pr comment <number> --attach`. A body line like `![How it works in light mode](.cache/verify/pr155-how-it-works-light-phone.png)` places the image where the criterion is listed.
- Screenshots from the live site or a worktree's server prove nothing about the PR. Name the site under each one.

## Cleanup

Stop only the dev server you started. In PowerShell, `(Get-NetTCPConnection -LocalPort 3100 -State Listen).OwningProcess` gives its process id, and `taskkill /PID <id> /T /F` stops it and its children. Never stop `node` by name: Jasper's own server and other agents' servers are `node` too. Leave `.cache/verify/` in place, since it holds the evidence.
