# 0029: Count each game recap try before Claude is called

Status: draft (JAS-39). It does for game recaps what [0005](0005-ask-budget.md) did for Ask, which left recaps "for later"; that record stays as it was written.

## Context

A signed-in account can write 20 game recaps a day (`RECAPS_PER_DAY` in `src/lib/recap-store.ts`). Until now `createRecap` counted the account's saved rows in `match_recaps`, then loaded the match (up to 2 Riot calls), then called Claude Haiku, and saved the recap only once Claude had written it. The 2026-10-29 wellness run found two ways around the cap:

1. Tries sent at the same moment all passed the count, because none of them was saved yet. On a real Postgres, 30 tries sent at once made 30 Claude calls.
2. A try that failed (Claude refused, sent something unexpected, or the call threw) never saved a row, so it never counted. After 20 failed tries the 21st still called Claude.

Each try costs under a tenth of a cent on Haiku, but it also spends the Riot limit every page shares.

## Options considered

**Where a try is kept:**

- **A row in `match_recaps` before Claude is called.** It can't hold one: `headline` and `detail` are required, the row needs its game in `matches` first, and its key is game × player, so a second try on the same game has no row of its own.
- **A counter per account per day, raised with one conditional upsert.** Safe without a lock, but it counts calendar days in one timezone instead of the last 24 hours, and it's a second pattern next to Ask's.
- **A `recap_tries` table with one row per try, holding only the account and the time (chosen).** The same shape as Ask's `ask_questions` count, with nothing private in it.

**For tries sent at the same moment:**

- **One lock for the whole site, like Ask's.** Ask needs it because its monthly budget is shared. Recaps have no shared budget, so it would only make one account's burst hold up everyone else.
- **A lock per account (chosen).** `pg_advisory_xact_lock(hashtext('recap-tries'), hashtext(<account id>))`, held while counting and saving, a few milliseconds. Two accounts whose ids hash the same just share a lock now and then.

**For failed tries:** keep every try, whatever happened after it was saved. Ask gives a question back when Anthropic turned it down unbilled, because a question costs up to 50 cents. A recap try costs a tenth of a cent, so working out which failures were free isn't worth the code.

## Decision

`reserveTry()` in `src/lib/recap-store.ts` runs one transaction: the account's advisory lock, then the count of its `recap_tries` rows from the last 24 hours, then a new row if it has a try left. `createRecap` calls it after checking for a saved recap and before Riot or Claude. Migration 0022 makes the table; deleting the account deletes its rows. New recaps stop filling `match_recaps.created_by`, since nothing reads it now.

## Consequences

Good:
- The cap holds however many tries arrive at once: `src/lib/recap-store-db.test.ts` sends 30 and 20 reach Claude, and taking the lock out lets 26 through.
- Failed tries count, so retrying a game Claude can't write stops at 20.
- New recaps no longer say which account asked for them.

Bad:
- A try that fails because Anthropic or Riot is down still uses one of the day's 20. That's plenty for one player, and it errs on the safe side.
- Tries made in the 24 hours before the deploy aren't in `recap_tries`, so for one day an account can write up to 20 more recaps than the cap.
- `match_recaps.created_by` and its index stay, still holding who asked for older recaps. Dropping them is a separate migration, and Jasper's call, since it deletes data.
- There's still no monthly budget for the whole site, unlike Ask's $20. The Anthropic console's spend limit is the only cap on the total until Jasper picks a figure.
