# Match page

One game, minute by minute, against the enemy in the same role. The Summary tab has the result, the biggest swings and the 60-second review. The Replay tab has the replay with the Ask panel beside it. The Stats tab has the lane comparison at 10 and 15 minutes, team gold and deaths, early jungle, Team analysis, and each player's build and runes.

## Sub-features

- `summary` shows the result banner, kills and the biggest swings.
- `deep-dive` shows the replay with its plays, the scoreboard, "You vs <champion> at 10 and 15 minutes", team gold and deaths.
- `sample` is the stored sample game, which loads without the Riot key.

## How to get to it (user POV)

- "See a sample analysis" on the home page.
- A row in a profile's recent matches.
- A pasted link: `/player/<region>/<riot id>/match/<match id>`.

## Driving it with npm run shot

Preconditions: `npm run shot -- --check` says `ok` for the sample game.

- **Summary.** `npm run shot -- --pr <n> "/player/kr/Hide%20on%20bush-KR1/match/KR_8416261221"` shows the `Match summary` region with "Victory" and the "Biggest swings" section.
- **Replay.** Add `--tab "Replay"`. The screenshot shows the beta note, the `Replay` heading, the plays list and the two team tables, with `Ask about this game` beside it from 1280px wide.
- **Stats.** Add `--tab "Stats"`. The screenshot shows the 10 and 15 minute table, team gold and deaths; `Team analysis` and `Build and runes` are further down.
- **Phone and light mode.** Add `--phone`, `--light` or both to either of the above.

## Gotchas

- Prove analyzer changes on the sample game. Its numbers are fixed, so a before (live site) and after (preview) pair shows exactly what moved, and the golden tests in `src/lib/analyzer/golden.test.ts` check the same kind of numbers.
- The replay starts at the first play (1:51 in the sample game), not at 0:00. A screenshot shows that moment only.
- A preview's first visit starts a cold server, so the first shot of a run can take 30 seconds.
