---
name: verify-turnpoint-ux
description: Prove Turnpoint's UX journeys behave the way a player should experience them — calm flows with no error alerts, gentle search-form recovery, a home page that fits a phone, the home → sample game → 60-second review → replay path, signed-out teasers (Ask, game recap, notes) that lead to sign-in and back, and the Insights "You vs others" peer card and its compare forms. Drives the real app in headless Chromium and saves step-by-step screenshots and ARIA snapshots. Checks behavior of the current UI, not visual fidelity to the planned Soft Rounded style. For "does the data show" checks use the sibling skill verify-turnpoint.
---

# Verify Turnpoint UX

UX journeys follow a player through a flow and assert how it behaves at every step: the right thing is selected and on screen, nothing shows an error alert, the way back is kept, signed-out visitors get a clear teaser instead of a broken form. Functional checks (lookup, match list, data present) are in `verify-turnpoint`; this skill reuses its launch, doctor, harness and cleanup and adds only its own journeys.

The feature map is [features/README.md](features/README.md). Read it, then the feature file you are proving. Soft Rounded is picked but not shipped: these journeys assert roles, names, focus, scroll and URLs, which should survive the restyle. Do not fail a journey on colors or corner radii.

## Launch

Same instance as the functional skill. From the repo root:

```bash
npx tsx .claude/skills/verify-turnpoint/scripts/launch.ts          # http://127.0.0.1:3100, waits until the home page renders
```

Pick the target from the journey's `needs:`:

- `needs: nothing` (`ux-search-recovery`, `ux-phone-home`): the local dev server works with no `.env.local`.
- `database`, `riot`, `supabase`: the local server needs `.env.local` (`RIOT_API_KEY`, `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `ANTHROPIC_API_KEY`). Without it, use the live site (`--base https://league-web-app.vercel.app`, what `main` shows now) or a PR preview (`--base https://<preview>.vercel.app` with `VERCEL_AUTOMATION_BYPASS_SECRET` set; only Jasper can add it).

Launch details (port rules, `npm ci`, the state file `.cache/verify-turnpoint-server/instance.json`, one server per checkout) are in `.claude/skills/verify-turnpoint/SKILL.md` → Launch. No migrations or seed step; never run `npm run db:migrate`.

## Doctor

```bash
npx tsx .claude/skills/verify-turnpoint/scripts/doctor.ts                                   # launched instance
npx tsx .claude/skills/verify-turnpoint/scripts/doctor.ts --base https://league-web-app.vercel.app
```

Require `home page ok`, `alive, so the port is ours` for a local target, and `ok` on each capability the journey needs (`sample game` = database, `player profile` = riot, `signed-out Ask` = supabase). `riot-key` means the Riot key is missing or expired; drive that journey elsewhere rather than weakening it.

## Drive

```bash
npx tsx .claude/skills/verify-turnpoint-ux/scripts/drive.ts --list
npx tsx .claude/skills/verify-turnpoint-ux/scripts/drive.ts [--base <url>] [--run <id>] <journey...|all>
# e.g. on the launched local instance:
npx tsx .claude/skills/verify-turnpoint-ux/scripts/drive.ts ux-search-recovery ux-phone-home
# data journeys on the live site:
npx tsx .claude/skills/verify-turnpoint-ux/scripts/drive.ts --base https://league-web-app.vercel.app ux-review-path ux-signed-out-teasers ux-insights-peer-card
```

| Journey | needs | Device | Feature file |
|---|---|---|---|
| `ux-search-recovery` | nothing | Desktop Chrome | [features/search-recovery.md](features/search-recovery.md) |
| `ux-phone-home` | nothing | Pixel 7 | [features/phone-home.md](features/phone-home.md) |
| `ux-review-path` | database | Desktop Chrome | [features/review-path.md](features/review-path.md) |
| `ux-signed-out-teasers` | riot, supabase | Desktop Chrome | [features/signed-out-teasers.md](features/signed-out-teasers.md) |
| `ux-insights-peer-card` | riot, database | Desktop Chrome | [features/insights-peer-card.md](features/insights-peer-card.md) |

"Calm" (the `expectCalm` helper in `scripts/drive.ts`) means: no `role=alert` element with text on the page, and the page is the app (not the Riot-key notice, an error page, or the Vercel login). Next.js's route announcer (`<next-route-announcer>`) is also `role=alert` and reads the new page title after every client-side navigation; it is skipped. Browser contexts use `reducedMotion: "reduce"`, so smooth scrolls land at once.

To add a journey: add an entry to `journeys` in `scripts/drive.ts` (each `step()` = one user action plus what the player should see), write its feature file, run it once, and look at the screenshots.

Exit code 0 = every journey passed; 1 = at least one failed.

## Evidence

Same layout and folder as the functional skill (git-ignored, kept by cleanup): `.cache/verify-turnpoint/<run id>/<journey>/` with `NN-<step>.png` (viewport after the step), `NN-<step>.aria.yml` (ARIA snapshot of `<main>`), `steps.jsonl`, `result.json`; `run.json` records target and commit.

- UX proof is the sequence. Hand over the screenshots in order (before the action, after it), not just the last one, plus the ARIA snapshot that shows the selected tab, `aria-invalid`, or the missing text box.
- Viewport screenshots are deliberate: "it scrolled to the replay" is only provable from what is on screen.
- A teaser is a pass only when the teaser shows (copy, illustration, Sign in link). "Ask isn't available right now.", the Riot-key notice, or the Vercel login is a FAIL with that reason.
- Name the target with every artifact; live-site screenshots prove nothing about an unmerged branch.
- All journeys are read-only. Signed-in flows (asking a question, saving a note, the written recap) are not covered: there is no test account.

## Cleanup

```bash
npx tsx .claude/skills/verify-turnpoint/scripts/cleanup.ts
```

Stops only the server `launch.ts` recorded and its children, removes the state file and log, keeps `.cache/verify-turnpoint/`. Never kill `node` by name. Run it after failed attempts too.

## Helpers

| Helper | Invocation | Does |
|---|---|---|
| `scripts/drive.ts` (this skill) | `npx tsx .claude/skills/verify-turnpoint-ux/scripts/drive.ts [--base <url>] [--run <id>] <journey…\|all>` | UX journeys; `expectCalm`, `panel(page, heading)`, `inViewport(page, heading)` helpers |
| `launch.ts` | `npx tsx .claude/skills/verify-turnpoint/scripts/launch.ts [port]` | starts and waits for our dev server |
| `doctor.ts` | `npx tsx .claude/skills/verify-turnpoint/scripts/doctor.ts [--base <url>]` | read-only health and capability check |
| `runner.ts` | imported from `../../verify-turnpoint/scripts/runner` | browser and device, preview bypass, step recorder, evidence layout |
| `cleanup.ts` | `npx tsx .claude/skills/verify-turnpoint/scripts/cleanup.ts` | stops our dev server, keeps evidence |

Keep the map honest as the app changes with `/maintain-verification-skill`. When Soft Rounded ships, re-run every journey, look at the screenshots, and update feature files whose copy or layout changed.
