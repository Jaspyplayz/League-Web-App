# Text on screen that promises more than the feature does

A heading, button or example question says the feature will do something it can't do in some cases the ticket names, so a player spends time or a limited allowance on a promise it then breaks.

## 2026-10-31

- **What happened:** JAS-105's Ask panel was headed "Ask about this game" and offered example questions naming the game by champion and date, while Claude could only find games among the player's 20 latest. On the home page's sample game, and on any older game, a player would spend one of their 10 daily questions on an answer about other games. The panel should only promise what Ask can do, here by putting the match ID in the examples, which `analyze_game` reads for any game the player played.
- **Evidence:** reviewer blocker 2 on commit 5a4b462 (`src/components/ask/ask-panel.tsx:37`, `:91`, `:112-114`); the builder's own `docs/ask.md:5` on that commit named the gap.
- **Root cause:** the builder wrote down the limit in the docs and treated that as enough, without checking the on-screen text against the ticket's "Works with the sample game" criterion.
- **Rung:** none yet
- **Fix:** none yet, as a first occurrence. This PR fixes the instance: the examples carry the match ID.
