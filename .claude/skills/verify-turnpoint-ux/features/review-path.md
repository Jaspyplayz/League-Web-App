# 60-second review path

From the home page a visitor can reach a game's 60-second review in one click and jump from a moment straight to it in the replay: the Replay tab opens with the replay on screen and Ask beside it, and going back to Summary brings the review back. The moments are marked inside Game review, the Summary's right column, which opens on the biggest one.

## Sub-features

- `path-entry` takes `Open this game` on the home page to the sample game with `Summary` selected, calm.
- `path-review` shows the opened play in the `Game review` region marked `In your 60-second review`, with its `Think about` question.
- `path-replay` switches to `Replay` from `Watch in replay`, hides the Summary panel, and puts the `Replay` heading on screen.
- `path-ask` shows `Ask about this game` beside the replay at 1280px and wider, under it below that.
- `path-back` brings `Game review` back when `Summary` is chosen again.

## How to get to it (user POV)

- Choose `Open this game` under the example game on the home page.
- Choose a game in a profile's `Recent matches` list, then use the review on its Summary tab.

## Driving it with drive.ts

Preconditions:

- doctor reports `sample game [needs: database] ok`.
- Signed out, fresh context, reduced motion.

- **Home.** Go to `/`. Calm.
- **Choose the sample.** Click the link `Open this game` (exact name). The URL contains `/match/KR_8416261221`, tab `Summary` has `aria-selected="true"`, and the page is calm.
- **Reach the review.** Scroll the region `Game review` into view. Its `aria-current` play contains `In your 60-second review`, and `Think about` is visible (first lines saved as `notes.firstMoment`).
- **Watch in replay.** Click `Watch in replay` in Game review. Tab `Replay` has `aria-selected="true"`, tabpanel `Summary` is hidden, and the heading `Replay` is inside the viewport.
- **Ask beside it.** The heading `Ask about this game` is visible, to the right of `Replay` at 1280px and wider and below it otherwise (saved as `notes.askPlacement`).
- **Back.** Click the tab `Summary`. The region `Game review` is visible.
- **Run.** `npx tsx .claude/skills/verify-turnpoint-ux/scripts/drive.ts [--base <url> | --pr <number>] ux-review-path`.
- **Proof.** `03-reach-the-60-second-review-in-game-review.png`, then `04-watch-the-moment-in-the-replay.png` (Replay timeline and the play for that moment on screen), then `05-ask-sits-beside-the-replay.png`, then `06-back-to-summary-keeps-the-review.png`.

## Gotchas

- After the click, Next.js's route announcer fills a `role=alert` with the new page title. It is not an error; `expectCalm` skips it.
- Without reduced motion the scroll to Replay is smooth. Check the viewport after it lands, not right after the click.
- The replay's highlighted play depends on the moment. Assert the heading on screen, not a timestamp.
