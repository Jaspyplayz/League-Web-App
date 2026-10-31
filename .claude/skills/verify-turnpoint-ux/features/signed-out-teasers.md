# Signed-out teasers

Features that need an account show a signed-out visitor a clear, calm teaser instead of a form that fails: Ask and Game recap explain what signing in gets them, show an illustration labeled as not a real game, and link to sign-in with the way back kept; Add to notes takes them to the notes teaser.

## Sub-features

- `teaser-old-address` sends the old Ask tab's address, `/player/<region>/<riot id>/ask`, to the profile.
- `teaser-ask` shows the Ask teaser copy and illustration on the game's `Replay` tab, with no text box.
- `teaser-sign-in` takes `Sign in` to `/sign-in?next=<the game's page>` with `Continue with Google` and `Continue with Discord`.
- `teaser-recap` shows the `Game recap` teaser ("Sign in to get a short written recap of this game.") with an illustration and no recap button.
- `teaser-notes` scrolls `Add to notes` to the `Your notes` teaser ("Sign in to keep private notes on this game…") and shows no note box.

## How to get to it (user POV)

- Open any game, choose its `Replay` tab, then `Sign in` in the Ask panel beside the replay.
- Open any game and scroll its Summary to `Game recap`.
- Choose `Add to notes` on a moment in a game's `60-second review`.

## Driving it with drive.ts

Preconditions:

- doctor reports `sample game [needs: database] ok` and `signed-out Ask [needs: supabase] ok`.
- Signed out, fresh context.

- **Old address.** Go to `/player/kr/Hide%20on%20bush-KR1/ask`. The page lands on `/player/kr/Hide%20on%20bush-KR1`.
- **Ask teaser.** Go to the sample game and click the tab `Replay`. Calm; the region `Ask about this game` contains `to ask questions about this player` and `Illustration · not a real game`, and 0 `textbox`es.
- **Sign in round trip.** Click `Sign in` inside that region. The URL matches `/sign-in?next=%2Fplayer%2Fkr%2FHide%2520on%2520bush-KR1%2Fmatch%2FKR_8416261221`; level-1 heading `Sign in`; buttons `Continue with Google` and `Continue with Discord` are visible.
- **Recap teaser.** Go to the sample game. The panel headed `Game recap` shows `to get a short written recap of this game.` and `Illustration · not a real game`, with no button named like `recap`.
- **Notes teaser.** Click the first `Add to notes` in `60-second review`. The heading `Your notes` is on screen, its panel shows `to keep private notes on this game`, and `#match-note` does not exist.
- **Run.** `npx tsx .claude/skills/verify-turnpoint-ux/scripts/drive.ts [--base <url> | --pr <number>] ux-signed-out-teasers`.
- **Proof.** Steps `01`–`05` screenshots and ARIA snapshots.

## Gotchas

- "Ask isn't available right now." means the target lacks `ANTHROPIC_API_KEY`, Supabase or `DATABASE_URL`. That's a FAIL with that reason, not a teaser.
- The header has a `Sign in` button and the Game recap teaser has its own illustration. Scope to the region `Ask about this game`.
- Don't click `Continue with Google` / `Discord`: it leaves for a real OAuth login.
- The recap and notes panels have headings but no region names; the journey finds the innermost block holding the heading.
