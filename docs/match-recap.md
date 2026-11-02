# AI match recaps

On the match page, a signed-in player can click **Write recap** to get a headline and a few short points, each with its game time, on what decided the game. The headline also shows under that game in the profile's By day view. A signed-out visitor on a game with no saved recap sees one labeled illustration under Game recap, plus the sign-in link. Writing a recap still requires sign-in, and a saved recap is shown as written.

## How it works

1. `src/lib/recap-store.ts` checks that the account has a try left today and saves the try in the `recap_tries` table (migration 0022), before Riot or Claude is called (see Abuse below).
2. The server loads the match and timeline from Postgres (or Riot) and runs the normal analyzer, exactly as the match page does.
3. `src/lib/analyzer/recap-facts.ts` boils that down to a short JSON list of facts: result, gaps to the lane opponent at 10 and 15, the biggest win chance swings, turning points, deaths by kind, objectives, the game score, and for junglers the pathing vs lane strength minutes, each gank and the farm.
4. `src/lib/recap.ts` sends those facts to Claude Haiku (`claude-haiku-5-5`) with instructions to use only the facts given and to describe the situation rather than grade decisions. A JSON schema makes the reply always 3 to 6 points in game order, each with a time ("12:00", a range, or "Overall") and one short sentence, plus a headline that may only repeat what the points say. Points are saved one per line in `detail` as `time<tab>text` (`src/lib/recap-points.ts` reads them back).
5. `src/lib/recap-store.ts` saves it in the `match_recaps` table (migration 0012), keyed by match and player. Finished games never change, so each recap is written once and shown to everyone after that.

The browser never sends any facts: the action only says which game and which player, and the server works everything out again. So nobody can make Claude write about a game that didn't happen.

## Why it's built this way

- **The model only writes words.** The numbers come from tested code, which keeps the recap accurate and each request small.
- **Cost.** About 5,000 tokens in and a few hundred out, which is well under a tenth of a cent per game on Haiku. Recaps are written only when someone clicks, and saved forever.
- **Abuse.** Only signed-in accounts can write recaps, at most 20 tries per account in 24 hours (`RECAPS_PER_DAY`), counted whether Claude writes the recap or not. Each try is saved in `recap_tries` before Riot or Claude is called, under a lock for that account, so tries sent at the same moment take turns at the count instead of all getting past it ([0029](adr/0029-count-each-recap-try-before-claude.md)). An account already at 20 is turned away before it waits for the lock, a try gives up after 3 seconds waiting for it, and an account's tries more than a day old are deleted at its next try. Opening a game that already has a recap doesn't use a try. Unlike Ask, recaps have no monthly budget for the whole site, so set a monthly spend limit in the Anthropic console as a second guard.
- **Swappable.** `src/lib/recap.ts` is the only recap file that talks to the model, so trying another provider for recaps means changing one file. (Ask has its own, `src/lib/ask.ts`; see [ask.md](ask.md).)

## Setup

Set `ANTHROPIC_API_KEY` (from https://console.anthropic.com) in Vercel for Production and Preview, and in `.env.local` to try it locally. Without it, the Write recap button is hidden and saved recaps still show. Apply the migrations with `npm run db:migrate` (0012 makes `match_recaps`, 0022 `recap_tries`).

## Testing the cap

`src/lib/recap-store.test.ts` runs in CI on a pretend database. Only a real Postgres shows what tries sent at the same moment do, so `src/lib/recap-store-db.test.ts` sends 30 at once and checks that only 20 reach Claude. It also checks the 24-hour window, the delete of older tries, and both ways a try avoids waiting long for the lock. It adds and deletes only its own rows (games named `RECAPTEST_…` and two test accounts), but it still runs only when `RECAP_TEST_DATABASE_URL` points at a database on this machine with "test" in its name. The loop applies the migration files with `psql` instead of `npm run db:migrate`, so nothing can reach the live database:

```sh
docker run -d --rm --name recap-pg -e POSTGRES_PASSWORD=local -e POSTGRES_DB=recap_test -p 127.0.0.1:55433:5432 postgres:17
docker exec recap-pg psql -U postgres -d recap_test -c "create schema auth; create table auth.users (id uuid primary key);"
for f in drizzle/0*.sql; do docker exec -i recap-pg psql -q -U postgres -d recap_test -v ON_ERROR_STOP=1 < "$f"; done
RECAP_TEST_DATABASE_URL=postgres://postgres:local@127.0.0.1:55433/recap_test npx vitest run src/lib/recap-store-db.test.ts
docker stop recap-pg
```

On a machine without Docker but with Postgres installed, start a throwaway server with `initdb` and `pg_ctl` as a user other than root, create a `recap_test` database, then run the middle three steps with `psql -h 127.0.0.1 -p <its port> -U postgres -d recap_test` in place of `docker exec`.
