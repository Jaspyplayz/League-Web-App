# A refusal retried on every run

Code that wakes often treats an outside service's refusal as "try again next run", so a refusal that lasts repeats its side effects, such as a comment or a red run, on every wake-up.

## 2026-11-02

- **What happened:** the ticket queue's first version (PR 296) edited a refused builder start's comment so it no longer held the ticket, and the next run started over with a new start comment, another refused fire and another edit. The queue wakes on every Agent merge run, so a refusal that lasts (a bad token, a paused task, the hourly fire limit) would add a comment to the same ticket on every run. It should hold every start for a while after a refusal.
- **Evidence:** the reviewer agent's report at `5977c1a` on [PR 296](https://github.com/Jaspyplayz/League-Web-App/pull/296), blocker 1: six rounds against a fire that always answered 429 left six refused comments on one ticket. The code was `runRound` in `scripts/run-queue-rest.ts` at `5977c1a`.
- **Root cause:** the design brief Claude wrote for its delegate covered one refused fire ("doesn't count as a try, a later run tries again") and never asked what happens when the refusal lasts across runs. Every test ran a single round, so nothing showed the repeat.
- **Rung:** none yet
- **Fix:** none yet, as a first occurrence. The hold itself is in PR 296, tested by `after the hourly fire limit, starts nothing on its own for an hour, so a lasting limit doesn't add a refused comment each run` and `after a refusal only Jasper can fix, starts nothing on its own for a day instead of failing a run each hour, and a run by name tries again` in `scripts/run-queue-rest.test.ts`.
