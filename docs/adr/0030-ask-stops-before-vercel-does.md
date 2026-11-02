# 0030: Ask stops itself before Vercel does, so its cost gets saved

Status: draft. It changes [0005](0005-ask-budget.md), which left "a time limit on the agent loop, so it always stops in time to settle" out of scope; that record stays as it was written.

## Context

Ask answers inside the match page's Server Action, and Vercel stops it at the page's `maxDuration` of 180 seconds. Each question is saved with a 50-cent estimate (`HOLD_MICROS`) before Claude is called, and `settle()` swaps in what it really cost at the end. A question Vercel stops never reaches `settle()`, so it keeps the 50 cents, whatever its rounds cost by then.

Nothing kept a question under 180 seconds. One round could take 130 (two tries of 60 seconds and a pause of up to 10), and a question has up to 8 rounds. So a long, tool-heavy question could be stopped after Anthropic had billed more than 50 cents, and the difference never counted toward the $5 account cap or the $20 site budget. The 2026-10-29 wellness run found it.

## Options considered

- **Raise the saved estimate before each round.** The saved cost would follow the spending, but it's a database write per round, and a round still in flight when Vercel stops the request would be guessed, not known.
- **Stop starting rounds at about 150 seconds,** as the wellness run suggested. Simple, but a round started at 149 seconds could still run 130 more.
- **A time limit that no try runs past (chosen).** All in `src/lib/ask.ts`, no extra database writes, and the question ends in time for `settle()` to save what it cost.

## Decision

`answerQuestion` gets a time limit 120 seconds after it starts (`ASK_TIME_LIMIT_MS`). Each try is aborted after the smaller of 60 seconds and the time left. A try cut off that way may have been billed, so it adds the 50-cent estimate, like any timeout. It's an abort signal rather than the SDK's `timeout` option, because that option only covers the wait until Anthropic's reply starts: a reply that started and then stalled would run on. A round isn't started with under 20 seconds left (`MIN_TRY_MS`), since it would most likely be cut off and could be billed anyway, and the second try is skipped when the pause before it would leave less. A round started with under a minute left is the last one, sent with no tools like the 8th, so Claude answers with what it has read rather than asking for games there'd be no time to send it. The tools' results are waited for only while another round could still start. When the limit stops a question, `answerQuestion` returns what it cost so far with an error, and `ask-store.ts` saves it like any other failed question.

The other 60 seconds of the page's 180 are for what runs outside `answerQuestion`, which the time limit can't see: the sign-in check and the player's Riot lookup before it, and saving the cost after. The lookup takes 40.25 seconds when Riot isn't answering and the shared rate limit is full, as the test sets it up: three tries, each with three one-second checks of the rate limit, two one-second waits for a turn and an 8-second timeout, plus pauses between tries. The wellness run suggested 150 seconds, which would leave 30, less than the lookup alone. `src/lib/ask-time-limit.test.ts` runs the real Riot client that way on a pretend clock, times it, reads `maxDuration` from the match page, and fails unless 15 seconds are still left after the lookup and the 120, for the sign-in check and saving. It fails on the 150 seconds first written here (10.25 seconds short), and on a Riot timeout raised to 10 seconds or a fourth try. The waits for a turn and the speed of each rate-limit check are the test's own, so a longer cap on waiting (`MAX_WAIT_MS`) doesn't fail it.

## Consequences

Good:
- A question that ends normally or at the limit saves what its rounds cost, plus 0005's 50-cent estimate once for each round with a try that may have been billed, so the caps hold as 0005 describes, to within the last question let in. The estimate is once per round, so a round whose two tries were both cut off still adds 50 cents, not a dollar.
- A question that runs long ends with "Couldn't finish answering. Try again in a moment." instead of a request Vercel stopped.

Bad:
- A question that would have finished between 120 and 180 seconds now fails, and is charged for what it used. Most take well under a minute.
- A try cut off at the limit adds 50 cents, even if it really cost less. That errs on the safe side.
- A round started with under a minute left can't reuse the cached conversation, because changing which tools Claude may use drops the cached messages. It pays the cache-write price for them instead of the cache-read price: about 9 cents more on a 40,000-token conversation, which `costMicros` counts. Before, only the 8th round paid that.
- A long question's answer rests on the games Claude read in about its first minute, so a question about a pattern may read fewer games than it would have.
- The last-round rule doesn't cover every case. A round started with 60 to 80 seconds left can still ask for games, and if its reply comes back with under 20 seconds left, or the games take too long, the question ends with no answer and is charged for its rounds. Keeping room for one answering round after every round that may ask for games would need a second, earlier limit for those rounds, and that was left for later.
- The limit counts from when `answerQuestion` starts, not from when the request did. The test measures the Riot lookup, but the 15 seconds for the sign-in check, `reserve()` and `settle()` is a judgement: none of them has a timeout of its own. Passing the request's start time in would need `ask-store.ts` and `askAction` to change.
- The 40.25 seconds assumes the rate-limit checks are few. `waitForTurn` in the Riot client caps how long it sleeps, not how many times it checks, and each check can take up to a second, so with a slow database and many short waits a lookup can run longer: 20 checks of just under a second, each asking for a 100-millisecond wait, took 94 seconds on the test's pretend clock. Then Vercel can still stop the request before `settle()`. That needs Riot not answering, the rate limit full and the database slow at once.
- A crash, a deploy, or a `settle()` that fails still leaves the 50-cent estimate in place.
- `ask-store.ts` reports every question that runs out of time to Sentry as an error, like any other failed question.
- The 120 seconds and the page's 180 are kept in step by the test rather than by sharing one constant: Next.js reads `maxDuration` from the page file's own text when it builds (`extractExportedConstValue`), so it has to be a number written there.
