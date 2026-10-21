# 0005: Save each Ask question before Claude answers, and keep its cost in a ledger with no account

Status: draft, waiting on Jasper's "In my words" (issue #143).

## Context

Ask had two limits: 10 questions per account per 24 hours and $20 a month for the whole site. Before this change, `ask()` counted the questions already saved, called Claude, and only saved the new question once Claude had answered, which takes up to a few minutes. The codebase audit (2026-10-21) found four ways around the limits:

1. Questions sent at the same moment all passed the check, because none of them was saved yet. A script sending 200 at once could spend $10 to $40, up to twice the month's budget.
2. A question whose Claude call failed partway was never saved, so the rounds already paid for counted toward nothing.
3. The site's monthly total was the sum over `ask_questions`, whose rows are deleted with their account. Deleting an account (what you'd do to an abuser, or what the privacy page promises on request) gave its spending back to the month.
4. Nothing limited one account's share of the $20, and a second Google or Discord account is free.

## Options considered

**For questions sent at the same moment:**

- **Keep checking after, and lower the limits.** Simple, but the gap stays as wide as one Claude answer.
- **A lock per account.** Stops one account racing itself, but several accounts can still race the shared monthly budget.
- **One lock for the whole site, and save the question with an estimated cost before calling Claude (chosen).** The lock is held only while checking and saving, a few milliseconds, so questions still run side by side once saved. A Postgres advisory lock that ends with its transaction works on Supabase's transaction pooler.

**For the cost of a deleted account:**

- **Set `user_id` to null instead of deleting the row.** Keeps the cost, but also keeps the question and answer text, which breaks the privacy promise unless a database trigger blanks them, and deleting a user from the Supabase dashboard skips app code.
- **A separate `ask_spend` table with only a cost and a date (chosen).** Nothing private in it, so it can outlive the account, and `ask_questions` keeps deleting with the account as promised.

**For one account using the whole budget:** a per-account monthly cap. Jasper picked $5 of the $20 (2026-10-21) over $2 or none.

## Decision

`reserve()` in `src/lib/ask-store.ts` runs one transaction: `pg_advisory_xact_lock(hashtext('ask-budget'))`, then the three limit checks, then it saves the question in `ask_questions` (answer null) and a row in `ask_spend`, both with a 50-cent estimate (`HOLD_MICROS`). Claude is called after the transaction ends. `settle()` then writes the answer, games, model and cost into `ask_questions`, and the cost into `ask_spend`. Each round gets two tries, made by `sendRound` in `src/lib/ask.ts` rather than the SDK, so both can be checked. `answerQuestion` returns the cost of the rounds that finished even when a later round fails, plus the 50-cent estimate for any round with a try that timed out, lost its connection, was cut off or got a 5xx other than 529 (Anthropic may have run and billed it anyway). A question whose first round Anthropic turned down on both tries (a 4xx like rate limited, or 529 overloaded) cost nothing, so it's deleted and doesn't count. The site's monthly total is summed from `ask_spend`; the per-account total from `ask_questions`.

## Consequences

Good:
- The daily cap holds however many questions arrive at once. The per-account cap and the site budget hold to within one question (the last one let in, at most about 50 cents over), as long as each question costs no more than the 50-cent estimate it was checked at, which is well above the usual 5 to 20 cents.
- Failed questions are charged what their finished rounds cost, plus an estimate for a round that may have been billed without an answer, instead of nothing.
- Deleting an account no longer frees up budget, and no private text is kept to make that work.
- An account is stopped once it has spent a quarter of the month's budget. Like the site budget, it can go over by about one question, since the check happens before a question's cost is known, or by more if several questions sent at once each cost more than 50 cents (a round with a timed-out try adds 50 cents on top of its tokens). Four free accounts still could use all of it, which is why the site-wide $20 stays the real limit and the Anthropic console's spend limit stays as a backstop.

Bad:
- Every Ask question waits its turn for one lock. At a few milliseconds each that is fine at this site's traffic, but it would need a rethink at thousands of questions a minute.
- A round with a try that may have been billed (one that timed out, lost its connection, was cut off or got a 500 or 504) adds 50 cents on top of the rounds that finished, even if the try really cost less. So does a network outage between Vercel and Anthropic, even though nothing reached Anthropic. Both err on the safe side.
- A question cut off by the page's 3-minute limit, or whose `settle()` fails, keeps the 50-cent estimate it was saved with. That's usually more than it cost, but not if it had finished several rounds or had a timed-out try, and then the difference is never counted. A time limit on the agent loop, so it always stops in time to settle, was left out of scope (issue #143).
- Questions still being answered count at 50 cents, so near the end of the budget Ask can say it's paused while one of them is still running, a little early. That errs on the safe side.
- Questions asked on the live site between running the migrations and merging come from the old code, which doesn't write to `ask_spend`, so they're missing from the month's total. Merging soon after migrating keeps that gap small.
- The cost is stored twice, and the two copies are only kept in step by `settle()`.
- Recaps (`recap-store.ts`) still check after calling Claude. Haiku costs about a cent a recap, so that was left for later.

## In my words

_(Jasper writes this.)_
