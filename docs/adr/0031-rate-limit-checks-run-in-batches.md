# 0031: Each server takes Riot rate-limit turns in batches

Status: accepted. The shared count it batches is described in [ARCHITECTURE.md](../../ARCHITECTURE.md#staying-inside-riots-rate-limit). Other open PRs were writing records 0029 and 0030 at the same time, so this number may need to move when it merges.

## Context

Every Riot request asks the shared count in Postgres for a turn first (`src/lib/riot/rate-limit-store.ts`). Each ask was its own transaction, which locks the host's row in `riot_rate_limits`, reads it, writes the new count and commits. When an ask takes more than a second, the request goes to Riot without waiting for it.

Sentry issue TURNPOINT-6 logged 47 asks over that second between 2026-10-25 and 2026-11-02. The ticket that raised it (JAS-159) guessed they came from the first database connection after a cold start. The events say otherwise:

- 36 of them came in the same second, from one burst of player pages, on a server that had been up 16 minutes. One page's trace shows about 20 asks queued behind the `americas` row lock and the 5-connection pool, waiting from 196 ms up to 1,256 ms each.
- Riot answered "too many requests" twice in that second. Spans are sampled at 10%, so there were likely more. The asks that timed out were the ones at the back of the queue, the likeliest to find the window full. Their requests went to Riot before the answer came back, and an ask that did find the window full never counted its request.
- No single statement was slow (p95 84 ms, max 662 ms over 7,860 spans), and only about 6 events came near a cold start.

A page that loads a player's games starts 15 or more Riot calls at once, so ordinary pages queued too: three other sampled traces had 10 to 20 waits over 500 ms.

## Options considered

- **Report the timeout as a warning, or not at all.** It quiets Sentry, but the uncounted requests and Riot's 429s stay.
- **A longer limit for the first ask, or warm the connection.** It covers the cold-start minority, not the queue.
- **Fewer statements per ask** (one upsert that locks and reads). It shortens each turn by about a third, but 20 asks still queue one behind another.
- **One ask per host at a time on each server, answering everyone who asked while it ran.** A burst of 20 costs one transaction instead of 20.

## Decision

Batch the asks on each server. Calls started together, like the 5 a page's game loader starts at once, go into one check. Anyone who asks while a check runs joins the next one. A check locks the row once, calls `takeTurn` once per request in order and saves the count once. The rules in `takeTurn` and the row lock between servers are unchanged.

Each request still waits at most a second before it goes ahead, counted from when it asked, including any time spent waiting for the check ahead of its own. A check still running after a second is left to finish on its own, and the next one starts. Each check sets `lock_timeout` to the same second, so one stuck behind a lock gives its connection back instead of keeping it. When requests in a batch run out of time, Sentry gets one report for the batch, with its host and how many requests it held. A database error gets its own report, once per check, even when it comes back after the requests have gone.

## Consequences

- A burst on one server costs one transaction instead of one per request, and the page's other queries no longer wait behind a queue of them for the 5 database connections.
- A check stuck on a dead connection doesn't hold its host up past a second. If it died holding the row's lock, each later check waits a second for that lock and then gives its connection back, so at most two or three stay open instead of one more every second.
- A check whose connection never answers keeps that connection until the socket gives up, and no setting inside Postgres can end it. Later checks use the pool's other connections. If they're all dead, the page's own queries hang too, so that's for the pool's settings in `src/db/index.ts` to fix, not the rate limiter.
- A request that ran out of time and went ahead is still counted when its check finishes, but only if the window has room and the check got the row's lock within its second. Otherwise nothing counts that request, as before: the window was full, or the check gave up on the lock and was reported. Riot's own "too many requests" answer and the client's back-off still catch that, and the Sentry report shows it happened.
- One Sentry event can now stand for several requests. Its `requests` field says how many.
- The batch lives in each server's memory, so servers still take turns on the row between them. Several servers bursting at once queue again, one batch each, and a check still waiting for the lock after a second fails without counting its requests. At Sentry's p95 of 84 ms a statement, that takes about four servers' checks queued on one row at once. A longer `lock_timeout` would count them late, but checks stuck behind a dead connection would then hold four of the pool's five connections, so the page's other queries come first.
- Sentry gives each batch's spans and reports to the request that started the run of checks, so a later batch's can appear under a page that has already finished.
- Each check sends one more statement (`set local lock_timeout`) than an ask did before.
