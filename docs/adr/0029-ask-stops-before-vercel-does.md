# 0029: Ask stops itself before Vercel does, so its cost is always saved

Status: draft. It changes [0005](0005-ask-budget.md), which left "a time limit on the agent loop, so it always stops in time to settle" out of scope; that record stays as it was written.

## Context

Ask answers inside the match page's Server Action, and Vercel stops it at the page's `maxDuration` of 180 seconds. Each question is saved with a 50-cent estimate (`HOLD_MICROS`) before Claude is called, and `settle()` swaps in what it really cost at the end. A question Vercel stops never reaches `settle()`, so it keeps the 50 cents, whatever its rounds cost by then.

Nothing kept a question under 180 seconds. One round could take 130 (two tries of 60 seconds and a pause of up to 10), and a question has up to 8 rounds. So a long, tool-heavy question could be stopped after Anthropic had billed more than 50 cents, and the difference never counted toward the $5 account cap or the $20 site budget. The 2026-10-29 wellness run found it.

## Options considered

- **Raise the saved estimate before each round.** The saved cost would follow the spending, but it's a database write per round, and a round still in flight when Vercel stops the request would be guessed, not known.
- **Stop starting rounds at about 150 seconds.** Simple, but a round started at 149 seconds could still run 130 more.
- **A time limit that no try waits past (chosen).** All in `src/lib/ask.ts`, no extra database writes, and the question always ends in time for `settle()` to save what it cost.

## Decision

`answerQuestion` gets a deadline 150 seconds after it starts (`ASK_TIME_LIMIT_MS`). Each try's timeout is the smaller of 60 seconds and the time left, so a try that would run past the deadline is cut off there and counted like any other timeout: it may have been billed, so it adds the 50-cent estimate. A round isn't started with under 20 seconds left (`MIN_TRY_MS`), since it would most likely be cut off and could be billed anyway, and the second try is skipped when the pause before it would leave less. The tools' results are waited for only until the deadline. When the deadline stops a question, `answerQuestion` returns what it cost so far with an error, and `ask-store.ts` saves it like any other failed question.

A test in `src/lib/ask.test.ts` reads `maxDuration` from the match page and fails if 150 seconds plus 30 no longer fit in it. The 30 are for what runs outside `answerQuestion`: looking the player up before (a slow Riot call can take 26 seconds) and saving the cost after.

## Consequences

Good:
- A question that ends normally or at the deadline saves at least what its rounds were billed, so the caps hold as 0005 describes, to within the last question let in.
- A question that runs long ends with "Couldn't finish answering. Try again in a moment." instead of a request Vercel stopped.

Bad:
- A question that would have finished between 150 and 180 seconds now fails. Most take well under a minute.
- A try cut off at the deadline adds 50 cents, even if it really cost less. That errs on the safe side.
- The deadline counts from when `answerQuestion` starts, not from when the request did. A player lookup slower than about 28 seconds before it, with a question that also runs to the deadline, could still let Vercel stop the request before `settle()`.
- The SDK's timeout covers the wait until Anthropic's reply arrives. Anthropic sends a reply that isn't streamed all at once, so that is the whole try, but a reply that started and then stalled partway would not be cut off at the deadline.
- A crash, a deploy, or a `settle()` that fails still leaves the 50-cent estimate in place.
- The 150 seconds is the page's limit less 30, kept in step by the test rather than by sharing one constant: Next.js reads `maxDuration` from the page file's own text when it builds (`extractExportedConstValue`), so it has to be a number written there.
