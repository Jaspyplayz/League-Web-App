**Tier:** normal: one page, styling only. Jasper merges it, because `src/app/sign-in/` is on the risky-paths list.
**Builder:** Claude Code on Opus 5.5, in a cloud session.
**Ready to merge:** no: Jasper merges this one by hand.
Closes JAS-104

## Summary
The sign-in page moves to the Review board look, and now says what an account adds, so a visitor has a reason to sign in. How sign-in works doesn't change: the same two forms call the same `signIn()` server action with the same hidden fields.

What the page shows, top to bottom, in a centred column up to 400px wide:

```
Sign in                              (text-title, sentence case)
Use your Google or Discord account. Turnpoint never sees your password.
┌ panel ───────────────────────────┐
│ (!) Signing in didn't finish…    │  only with ?error=, neutral colours
│ [G  Continue with Google  ]      │  48px, raised fill
│ [D  Continue with Discord ]      │
└──────────────────────────────────┘
What an account adds
  This is me. / Game notes. / Ask. (10 questions a day)
──────────────────────────────────
Riot sign-in line · privacy line
```

- `src/app/sign-in/page.tsx`: the layout, "What an account adds" and the two small lines at the bottom. The Ask line reads `QUESTIONS_PER_DAY` from `src/lib/ask-rules.ts`, so it can't drift from the real limit. The all-caps "Your account" eyebrow and the `font-display` uppercase title are gone.
- `src/app/sign-in/sign-in-panel.tsx` (new): the panel, moved out of the page. A Next.js page file can't export anything else, and the panel needed its own file so a test can render it with plain values (configured or not, `next`, `error`) instead of a real request. The page still reads the address behind the same `<Suspense>` boundary and hands those values over.
- The failed-attempt row uses the problem panel's colours from JAS-93 (a quiet "!" circle on the raised fill, text in the main colour), not the red tint JAS-90's canvas drew, because red only means the opponent.

To try it on the preview: open `/sign-in`, then `/sign-in?error=callback`, and switch the theme. If the preview has no Supabase values, the panel shows the not-set-up line instead of the buttons.

## Evidence
**Before:** the live site's `/sign-in` (`.cache/verify/before/league-web-app-sign-in.png`): an all-caps "YOUR ACCOUNT" eyebrow over a condensed uppercase "SIGN IN", outlined buttons, an error in red text, and nothing about what an account adds.

**After:** screenshots on the ticket, to set beside the canvas's Sign in boards (https://claude.ai/artifact/GcrFoi7ZhbWD8Z2CPvDGGT): https://linear.app/jaspy/issue/JAS-104/restyle-the-sign-in-page (the cloud's `gh` can't attach images to a GitHub comment). This PR's Vercel preview has no Supabase values, so it shows the not-set-up state in every theme; the buttons and `?error=callback` shots come from a local dev server running this branch with stand-in Supabase values. File names below are in `.cache/verify/` on the builder's machine (git-ignored).

Intended differences from the canvas:
- **The failed-attempt row is neutral, not red**, as the ticket says (Jasper, 2026-10-31).
- **"Game notes", not "Match notes"**: `GLOSSARY.md` calls it a Game note and lists "Match note" under Avoid. The line says "every game page" for the same reason.
- **Today's logos**, not the canvas's letter placeholders, as the ticket says.
- The header and footer are today's, since the header is another ticket's.

## Acceptance criteria
- [x] `/sign-in` shows the centred 400px column, "Sign in", the promise, one panel with the two 48px raised buttons and today's logos, "What an account adds" (This is me, Game notes, Ask with 10 questions a day), and the Riot and privacy lines: `local-signin/localhost-sign-in.png` (dark, on the ticket) and `localhost-sign-in-light.png`; Playwright measured a 400px column at 1280 and 560px wide and a 140px panel; test "offers Google and Discord, with no alert"
- [x] `?error=callback` shows an alert row above the buttons with today's messages, in the neutral problem colours: `localhost-sign-in-error-callback.png` (dark) and `localhost-sign-in-error-callback-light-phone.png`, both on the ticket; tests "shows today's message above the buttons after a failed attempt, in neutral colours" (fails when the row gets `bg-behind/15`, checked) and "falls back to the start message for an unknown error"
- [x] Without sign-in set up, the panel says "Sign-in isn't set up on this copy of the site yet." in place of the buttons: the preview itself, `pr245-sign-in.png`, `pr245-sign-in-light.png` (on the ticket), `pr245-sign-in-phone.png`, `pr245-sign-in-light-phone.png`; test "says sign-in isn't set up in place of the buttons"
- [x] The changed files use only the new names and no all-caps: `grep` of `src/app/sign-in/` for `uppercase`, `tracking-`, `font-display`, `font-mono`, `soft-round`, `muted`, `faint`, `ink`, `line-strong` and `surface` finds nothing
- [x] Works with the sample game, on a phone and in light mode: the sample game loads on the preview (`pr245-player-kr-Hide-on-bush-KR1-match-KR_8416261221-phone.png`); phone and light shots above, with no sideways scroll at 390px (measured)

## Tested
- `npm run lint`: passed
- `npm run typecheck`: passed
- `npm test`: passed
- `npm run build`: passed
- `npm run shot -- --pr 245` on the preview (not-set-up state, dark, light, phone, and the sample game), and `npm run shot -- --base` locally: a dev server with stand-in Supabase values for the buttons and `?error=callback` (dark, light, phone), and a production build without them for the not-set-up state.

## Not tested
- Signing in for real: nothing about it changes, and the ticket says a signed-in test isn't needed.
- The fix commit 389ec03 has no Vercel preview: Vercel answered "Deployment rate limited — retry in 24 hours" (the preview limit is shared with another project), so its `Vercel` status is red and the smoke test didn't run on it. The smoke test and accessibility scan passed on f5d8985's preview, and 389ec03 only changes two Tailwind classes and a comment on the page (checked locally with Playwright) plus `docs/sign-in.md`. A redeploy after the limit resets turns `Vercel` green and reruns the smoke test.

## Merge Danger
**Door:** two-way. A revert puts the old page back; nothing is stored.

**Blast radius:** high by the template's rule, since it's the sign-in page, but the change is markup and classes, plus one line in `docs/sign-in.md`. If it's wrong, the sign-in page looks off or the buttons don't submit; the forms, hidden fields and `signIn()` action are the same as before, and the test checks the `next` field is still made safe.

## Review

Reviewer agent at 389ec035b4c2e0dbdb98965851a44ce24ce864d7: no blockers (re-review of the fix commit)
Reviewer agent at f5d898558b7a8ba5a7527678cc6900bd8194f931: no blockers

First review's findings:
1. Should-fix: the loading stand-in was 122px but the two-button panel is 140px, so the page jumped 18px when the buttons arrived. Fixed in 389ec03: `h-[140px]`, and Playwright measured the panel at 140px at 1280, 560 and 390px wide.
2. Should-fix: criteria unticked and screenshots "to come"; criterion 5 reworded. Fixed the first part: screenshots are on the ticket and each criterion names its shot. Rejected the second: the ticket's criterion 5 reads "Works with the sample game (the home page's example match), on a phone, and in light mode", which is what the PR copies.
3. Nit: the column could reach 448px on screens between 480 and 640px wide. Fixed in 389ec03: `max-w-[432px]` below `sm`, measured 400px at 560px wide.
4. Nit: no page-level test that the page passes `configured=false` when Supabase isn't set up. Left: it's one expression, the old page had no test either, and the panel's not-set-up branch is tested; the preview itself shows the not-set-up state.
5. Nit: `docs/sign-in.md` still said "Match notes". Fixed in 389ec03, and it now lists Ask.

Re-review's findings:
1. Nit: the stand-in's comment says the page doesn't jump, but it still moves on `?error=callback` (taller panel) and without Supabase (shorter). Left: the usual visit has no shift; fixing a comment would mean another push to a risky path and another preview build for a wording change.
2. Nit: "Docs and decisions touched" said none. Fixed in this description.

No interrogate panel: normal tier.

## Docs and decisions touched
`docs/sign-in.md`: "Match notes" becomes "Game notes" (the glossary's word, as on the page), and it lists Ask.

https://claude.ai/code/session_01KuR5TgHQsYUMsbRUhFMMit

---
_Generated by [Claude Code](https://claude.ai/code)_
