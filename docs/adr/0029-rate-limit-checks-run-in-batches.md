# 0029: Each server takes Riot rate-limit turns in batches

Status: accepted. The shared count it batches is described in [ARCHITECTURE.md](../ARCHITECTURE.md#staying-inside-riots-rate-limit).

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
- **One ask per host at a time on each server, answering everyone who asked while it ran.** A burst of 20 costs 2 transactions instead of 20.

## Decision

Batch the asks on each server. The first caller for a host starts a check. Anyone who asks while it runs joins the next one, which locks the row once, calls `takeTurn` once per caller in order and saves the count once. Each caller still waits at most a second before its request goes ahead. A check still running after a second is left to finish on its own, and the next one starts. A check that's slow or fails is reported to Sentry once, not once per caller. The rules in `takeTurn` and the row lock between servers are unchanged.

## Consequences

- A burst on one server takes two round trips to the row instead of one per request, and uses one database connection for rate limiting instead of up to five. The page's other queries no longer wait behind it.
- A check stuck on a dead connection doesn't hold its host up past a second, and a stuck database gets at most one new transaction a second per host, instead of one per Riot call. Requests still go ahead after a second, and a check that finishes late still counts them if the window has room.
- The batch lives in each server's memory, so servers still take turns on the row between them. Several servers bursting at once would queue again, one batch each.
- Sentry gives each batch's spans to the first caller's request, so a later batch's database spans and reports can appear under a page that has already finished.
