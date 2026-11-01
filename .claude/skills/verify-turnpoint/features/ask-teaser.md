# Signed-out Ask teaser

Ask lets a signed-in player ask questions about a player's games, from the panel `Ask about this game` beside the replay on a game's `Replay` tab. A signed-out visitor sees a teaser instead: an example question naming this game, a `Sign in` link that returns them to the game, and an illustration clearly marked as not a real game. There is no question box.

## Sub-features

- `ask-tab` shows the region `Ask about this game` once the `Replay` tab is chosen.
- `ask-teaser-copy` shows "Sign in to ask questions about this player's games, like “What decided my <champion> game on <date>?”".
- `ask-sign-in` links `Sign in` to `/sign-in?next=` the game's page.
- `ask-illustration` shows an example labeled `Illustration · not a real game`.
- `ask-no-input` shows no text box while signed out.
- `ask-unavailable` shows "Ask isn't available right now." when the target lacks its keys (a failure for this journey).

## How to get to it (user POV)

- Open any game and choose the `Replay` tab.
- The old address `/player/kr/Hide%20on%20bush-KR1/ask` now goes to the profile, which has no Ask.

## Driving it with drive.ts

Preconditions:

- doctor reports `sample game [needs: database] ok` and `signed-out Ask [needs: supabase] ok`, which needs `ANTHROPIC_API_KEY`, Supabase, and `DATABASE_URL` on the target.
- Signed out, fresh context.

- **Open Ask.** Go to the sample game and click the tab `Replay`. It has `aria-selected="true"` and the heading `Ask about this game` is visible; "Ask isn't available right now." is absent.
- **Teaser.** In the region `Ask about this game`, link `Sign in` has `href` matching `/sign-in?next=%2Fplayer%2Fkr%2FHide%2520on%2520bush-KR1%2Fmatch%2FKR_8416261221`; `Illustration · not a real game` and `What do my losses have in common?` are visible; there are 0 `textbox`es.
- **Run.** `npx tsx .claude/skills/verify-turnpoint/scripts/drive.ts [--base <url> | --pr <number>] ask-teaser`.
- **Proof.** `02-teaser-shows-sign-in-and-illustration.png` and `.aria.yml`.

## Gotchas

- The header has a `Sign in` button and the Game recap teaser on Summary has its own link and illustration. Scope to the region `Ask about this game`.
- The `next` value is double-encoded (`%2520` for the space). Match it literally.
- Signed-in Ask (asking a question, getting an answer) is not covered: there is no test account. It needs a Google or Discord login.
- Following the link to the sign-in page is the UX skill's `ux-signed-out-teasers`.
