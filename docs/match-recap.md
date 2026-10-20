# AI match recaps

On the match page, a signed-in player can click **Write recap** to get a headline and a few short points, each with its game time, on what decided the game. The headline also shows under that game on the Log tab.

## How it works

1. The server loads the match and timeline from Postgres (or Riot) and runs the normal analyzer, exactly as the match page does.
2. `src/lib/analyzer/recap-facts.ts` boils that down to a short JSON list of facts: result, gaps to the lane opponent at 10 and 15, the biggest win chance swings, turning points, deaths by kind, objectives, the game score, and for junglers the pathing vs lane strength minutes, each gank and the farm.
3. `src/lib/recap.ts` sends those facts to Claude Haiku (`claude-haiku-5-5`) with instructions to use only the facts given and to describe the situation rather than grade decisions. A JSON schema makes the reply always 3 to 6 points in game order, each with a time ("12:00", a range, or "Overall") and one short sentence, plus a headline that may only repeat what the points say. Points are saved one per line in `detail` as `time<tab>text` (`src/lib/recap-points.ts` reads them back).
4. `src/lib/recap-store.ts` saves it in the `match_recaps` table (migration 0012), keyed by match and player. Finished games never change, so each recap is written once and shown to everyone after that.

The browser never sends any facts: the action only says which game and which player, and the server works everything out again. So nobody can make Claude write about a game that didn't happen.

## Why it's built this way

- **The model only writes words.** The numbers come from tested code, which keeps the recap accurate and each request small.
- **Cost.** About 5,000 tokens in and a few hundred out, which is well under a tenth of a cent per game on Haiku. Recaps are written only when someone clicks, and saved forever.
- **Abuse.** Only signed-in accounts can write recaps, at most 20 per account per day (`RECAPS_PER_DAY`). Set a monthly spend limit in the Anthropic console as a second guard.
- **Swappable.** `src/lib/recap.ts` is the only recap file that talks to the model, so trying another provider for recaps means changing one file. (The Ask tab has its own, `src/lib/ask.ts`; see [ask.md](ask.md).)

## Setup

Set `ANTHROPIC_API_KEY` (from https://console.anthropic.com) in Vercel for Production and Preview, and in `.env.local` to try it locally. Without it, the Write recap button is hidden and saved recaps still show. Apply the migration with `npm run db:migrate`.
