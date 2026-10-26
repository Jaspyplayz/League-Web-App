# Insights peer card

The `You vs others` view leads with one `Skill to improve` against the compared rank, lets the visitor switch the rank in place without losing the view, and turns away a malformed Riot ID in `Compare with a player` with a plain message instead of an error page.

## Sub-features

- `peer-lead` shows `Skill to improve` inside the `You vs <Rank>` card (Challenger by default).
- `peer-rank` switches the card to `You vs Gold` when `Gold` is chosen and `Compare` is pressed, keeping `view=others` and staying calm.
- `peer-bad-id` shows an alert containing `isn't a Riot ID` for `nohashtag` and keeps the card.

## How to get to it (user POV)

- On a profile choose `Insights`, then `You vs others` in `Insights views`.
- Open a pasted link such as `/player/kr/Hide%20on%20bush-KR1/insights?view=others`.

## Driving it with drive.ts

Preconditions:

- doctor reports `player profile [needs: riot] ok` and `sample game [needs: database] ok`.
- Signed out, fresh context.

- **Open the view.** Go to `/player/kr/Hide%20on%20bush-KR1/insights?view=others`. Calm; a region named `You vs …` is visible.
- **Lead skill.** Inside that region the heading `Skill to improve` is visible (card heading saved as `notes.rankHeading`).
- **Switch rank.** In form `Compare with a rank`, select `gold` in `Rank` and click `Compare`. The URL has `tier=gold` and `view=others`; heading `You vs Gold` is visible; calm.
- **Bad player ID.** In form `Compare with a player`, fill `Their Riot ID` with `nohashtag` and click `Compare`. An alert containing `isn't a Riot ID` is visible and `You vs Gold` is still there.
- **Run.** `npx tsx .claude/skills/verify-turnpoint-ux/scripts/drive.ts [--base <url> | --pr <number>] ux-insights-peer-card`.
- **Proof.** `02-peer-card-leads-with-one-skill.png`, `03-compare-with-another-rank.png`, `04-compare-with-a-player-rejects-a-bad-id-calmly.png` (scrolled to the message).

## Gotchas

- `Skill to improve` only shows when the player trails the rank on a skill. Hide on bush trails Challenger but is ahead of Gold, so against Gold the card says "You are level with Gold…" and has no lead skill. Assert the lead only on the default rank.
- The bad-ID alert is a real `role=alert`, so this step does not call `expectCalm`.
- The rank form submits as a GET to the same page; the navigation fires the route announcer (skipped by `expectCalm`).
