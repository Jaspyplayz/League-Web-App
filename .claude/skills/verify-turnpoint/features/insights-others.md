# Insights: You vs others

The Insights tab's `You vs others` view compares the player's recent games with players of a rank (Challenger by default), leads with one skill to improve, and offers forms to compare with another rank or another player.

## Sub-features

- `others-view` marks `You vs others` current in the `Insights views` navigation (`Overview`, `You vs others`, `Habits and sessions`).
- `others-card` shows a region named `You vs <Rank>` (default `You vs Challenger`) with a per-game comparison table.
- `others-rank-form` offers the `Compare with a rank` form (select `Rank`, button `Compare`).
- `others-player-form` offers the `Compare with a player` form (`Their Riot ID`, region, `Compare`).

## How to get to it (user POV)

- On a profile, choose `Insights` in `Profile sections`, then `You vs others` in `Insights views`.
- Open a pasted link such as `/player/kr/Hide%20on%20bush-KR1/insights?view=others`.

## Driving it with drive.ts

Preconditions:

- doctor reports `player profile [needs: riot] ok` and `sample game [needs: database] ok`.
- Signed out, fresh context.

- **Open the view.** Go to `/player/kr/Hide%20on%20bush-KR1/insights?view=others`. In navigation `Insights views`, link `You vs others` has `aria-current="page"`.
- **Card.** A region whose name starts with `You vs ` is visible (heading saved as `notes.heading`, `YOU VS CHALLENGER` on live). The text `Not enough games to spot trends yet` is absent.
- **Forms.** The form `Compare with a rank` and the region `Compare with a player` are visible.
- **Run.** `npx tsx .claude/skills/verify-turnpoint/scripts/drive.ts [--base <url> | --pr <number>] insights-others`.
- **Proof.** `02-rank-comparison-shows.png` and `.aria.yml`.

## Gotchas

- Without enough of the player's games the view shows `Not enough games to spot trends yet` instead of the card. The journey fails with that reason.
- Using the forms (rank change, bad Riot ID) is the UX skill's `ux-insights-peer-card`.
- The rank select's values are lowercase (`gold`, `challenger`); its labels include game counts (`Gold (184 games)`).
