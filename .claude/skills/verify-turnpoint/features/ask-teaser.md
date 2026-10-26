# Signed-out Ask teaser

Ask lets a signed-in player ask questions about a player's games. A signed-out visitor sees a teaser instead: an example question, a `Sign in` link that returns them to Ask, and an illustration clearly marked as not a real game. There is no question box.

## Sub-features

- `ask-tab` marks `Ask` current in `Profile sections`.
- `ask-teaser-copy` shows "Sign in to ask questions about this player's games, like “What do my losses have in common?”".
- `ask-sign-in` links `Sign in` to `/sign-in?next=` the Ask page.
- `ask-illustration` shows an example labeled `Illustration · not a real game`.
- `ask-no-input` shows no text box while signed out.
- `ask-unavailable` shows "Ask isn't available right now." when the target lacks its keys (a failure for this journey).

## How to get to it (user POV)

- On a profile, choose `Ask` in `Profile sections`.
- Open a pasted link such as `/player/kr/Hide%20on%20bush-KR1/ask`.

## Driving it with drive.ts

Preconditions:

- doctor reports `signed-out Ask [needs: supabase] ok`, which needs `ANTHROPIC_API_KEY`, Supabase, and `DATABASE_URL` on the target.
- Signed out, fresh context.

- **Open Ask.** Go to `/player/kr/Hide%20on%20bush-KR1/ask`. Link `Ask` in `Profile sections` has `aria-current="page"`; "Ask isn't available right now." is absent.
- **Teaser.** In `main`, link `Sign in` has `href` matching `/sign-in?next=%2Fplayer%2Fkr%2FHide%2520on%2520bush-KR1%2Fask`; `Illustration · not a real game` and `What do my losses have in common?` are visible; there are 0 `textbox`es.
- **Run.** `npx tsx .claude/skills/verify-turnpoint/scripts/drive.ts [--base <url>] ask-teaser`.
- **Proof.** `02-teaser-shows-sign-in-and-illustration.png` and `.aria.yml`.

## Gotchas

- The header also has a `Sign in` button. Scope to `main`.
- The `next` value is double-encoded (`%2520` for the space). Match it literally.
- Signed-in Ask (asking a question, getting an answer) is not covered: there is no test account. It needs a Google or Discord login.
- Following the link to the sign-in page is the UX skill's `ux-signed-out-teasers`.
