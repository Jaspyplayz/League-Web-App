# Turnpoint UX verification map

This directory is the maintained source for verifying how Turnpoint's flows behave for a player: calm, recoverable, and clear when signed out. Read this index before driving, then use the matching feature file as the recipe. Whether data shows at all is the functional map in `verify-turnpoint/features/`.

## Baseline preconditions

- Target picked from the journey's `needs:`: the local dev server from `npx tsx .claude/skills/verify-turnpoint/scripts/launch.ts` (`http://127.0.0.1:3100`) for `needs: nothing`; otherwise a local server with `.env.local`, the live site `https://league-web-app.vercel.app`, or a PR preview with `VERCEL_AUTOMATION_BYPASS_SECRET`.
- `npx tsx .claude/skills/verify-turnpoint/scripts/doctor.ts [--base <url>]` reports `home page ok` and `ok` for each capability the journey needs.
- Test player `Hide on bush#KR1` on `kr`; sample game `/player/kr/Hide%20on%20bush-KR1/match/KR_8416261221` (stored, so it needs no Riot key).
- Signed out, fresh browser context, `reducedMotion: "reduce"`.
- The current UI, not Soft Rounded. Assert behavior, not colors or radii.

## Driving conventions

- Drive through `npx tsx .claude/skills/verify-turnpoint-ux/scripts/drive.ts [--base <url>] [--run <id>] <journey>`.
- Arrive the way a player does: click the home card, the tab, the button. A direct URL is used only where the recipe says the player arrives from a pasted link.
- Use roles and accessible names. Headings render uppercase through CSS; match names, or match text case-insensitively.
- "Calm" = no `role=alert` with text (Next's `<next-route-announcer>` is skipped) and the page is the app. Check it after every navigation the player makes.
- "On screen" = the heading's box is inside the viewport, checked after the scroll.
- Read-only journeys. Nothing to restore.

## Proof and skip reporting

- Each step saves a viewport screenshot, an ARIA snapshot of `<main>`, and a `steps.jsonl` line under `.cache/verify-turnpoint/<run id>/<journey>/`.
- Hand over the step sequence (action, then result), not only the last frame.
- Record the target and commit from `run.json` with every artifact.
- The Riot-key notice, "Ask isn't available right now.", the Vercel login, or an error page is a FAIL with that reason, never a pass.
- Report an unreachable journey with the doctor line that failed and the target tried. Do not prove one entry point through another.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with drive.ts` starts with `Preconditions:` and uses labeled bullets that pair each user action with the exact handle and observable result.
4. `Gotchas` lists traps that can waste or invalidate a run.

Keep implementation details out of the map. Name only user paths, stable handles, required state, commands, and observable proof.

## Features

- [Search form recovery](./search-recovery.md) covers a Riot ID without a tag: a clear inline message, the input kept, no page change. Journey `ux-search-recovery`.
- [Home on a phone](./phone-home.md) covers the home page on a Pixel 7: no sideways scroll, a reachable Analyze button, the start cards. Journey `ux-phone-home`.
- [60-second review path](./review-path.md) covers home → sample game → review → Watch in replay → back to Summary. Journey `ux-review-path`.
- [Signed-out teasers](./signed-out-teasers.md) covers Ask, Game recap and Your notes for a signed-out visitor, and the Sign in round trip. Journey `ux-signed-out-teasers`.
- [Insights peer card](./insights-peer-card.md) covers the You vs others card, switching rank, and a bad Riot ID in Compare with a player. Journey `ux-insights-peer-card`.
