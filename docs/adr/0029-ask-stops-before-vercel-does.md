# 0029: Ask stops itself before Vercel does, so its cost gets saved

Status: draft. It changes [0005](0005-ask-budget.md), which left "a time limit on the agent loop, so it always stops in time to settle" out of scope; that record stays as it was written.

## Context

Ask answers inside the match page's Server Action, and Vercel stops it at the page's `maxDuration` of 180 seconds. Each question is saved with a 50-cent estimate (`HOLD_MICROS`) before Claude is called, and `settle()` swaps in what it really cost at the end. A question Vercel stops never reaches `settle()`, so it keeps the 50 cents, whatever its rounds cost by then.

Nothing kept a question under 180 seconds. One round could take 130 (two tries of 60 seconds and a pause of up to 10), and a question has up to 8 rounds. So a long, tool-heavy question could be stopped after Anthropic had billed more than 50 cents, and the difference never counted toward the $5 account cap or the $20 site budget. The 2026-10-29 wellness run found it.

## Options considered

- **Raise the saved estimate before each round.** The saved cost would follow the spending, but it's a database write per round, and a round still in flight when Vercel stops the request would be guessed, not known.
- **Stop starting rounds at about 150 seconds,** as the wellness run suggested. Simple, but a round started at 149 seconds could still run 130 more.
- **A time limit that no try runs past (chosen).** All in `src/lib/ask.ts`, no extra database writes, and the question ends in time for `settle()` to save what it cost.

## Decision

`answerQuestion` gets a time limit 120 seconds after it starts (`ASK_TIME_LIMIT_MS`). Each try is aborted after the smaller of 60 seconds and the time left. A try cut off that way may have been billed, so it adds the 50-cent estimate, like any timeout. It's an abort signal rather than the SDK's `timeout` option, because that option only covers the wait until Anthropic's reply starts: a reply that started and then stalled would run on. A round isn't started with under 20 seconds left (`MIN_TRY_MS`), since it would most likely be cut off and could be billed anyway, and the second try is skipped when the pause before it would leave less. The tools' results are waited for only until the limit. When the limit stops a question, `answerQuestion` returns what it cost so far with an error, and `ask-store.ts` saves it like any other failed question.

The other 60 seconds of the page's 180 are for what runs outside `answerQuestion`, which the time limit can't see: the sign-in check and the player's Riot lookup before it, and saving the cost after. The lookup alone can take about 31 seconds when Riot is failing (three tries, each up to a 2-second wait for its turn and an 8-second timeout, plus pauses). The wellness run suggested 150 seconds, but that would leave 30, which the lookup alone could use up. A test in `src/lib/ask.test.ts` reads `maxDuration` from the match page and fails if 120 seconds plus 60 no longer fit in it.

## Consequences

Good:
- A question that ends normally or at the limit saves at least what its rounds may have been billed, so the caps hold as 0005 describes, to within the last question let in.
- A question that runs long ends with "Couldn't finish answering. Try again in a moment." instead of a request Vercel stopped.

Bad:
- A question that would have finished between 120 and 180 seconds now fails, and is charged for what it used. Most take well under a minute.
- A try cut off at the limit adds 50 cents, even if it really cost less. That errs on the safe side.
- The limit counts from when `answerQuestion` starts, not from when the request did, so the 60 seconds are an estimate of the rest, not a measurement. Passing the request's start time in would need `ask-store.ts` and `askAction` to change.
- A crash, a deploy, or a `settle()` that fails still leaves the 50-cent estimate in place.
- `ask-store.ts` reports every question that runs out of time to Sentry as an error, like any other failed question.
- The 120 seconds is the page's limit less 60, kept in step by the test rather than by sharing one constant: Next.js reads `maxDuration` from the page file's own text when it builds (`extractExportedConstValue`), so it has to be a number written there.
