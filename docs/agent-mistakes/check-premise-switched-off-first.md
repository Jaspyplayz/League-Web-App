# A check's premise switched off before the check reads

A check infers its answer from a setup it assumes is still in place, and a change turns that setup off before the check reads, so the check reports something that didn't happen.

## 2026-11-02

- **What happened:** on JAS-219, the fix for the first blocker made `scripts/shot.ts` remove the route that adds the preview's secret (`context.unrouteAll`) before reading `recordLeaks`' list, to stop a route still running at browser close from crashing the run. `recordLeaks` counts any redirect off the preview, in a chain that started there, as a leak because the route put the secret on that chain. With the route gone, a page still polling the preview sent requests with no secret, a Vercel-style login redirected them off-site, and the run printed a LEAK line though the other site never got the secret. The list should have been read first and the route removed after, as `e2e/fixtures.ts` and the verify-turnpoint scripts keep it on through their read.
- **Evidence:** reviewer blocker 1 on PR 306 at 2d29711 (`scripts/shot.ts:202-203` with `e2e/preview-login.ts:83-86` and `:100-106`). Reproduced at 2d29711 against a fake preview that redirects any request without the header to another site: `--pr 1 /poll /` printed `LEAK: the bypass secret went to other sites: http://127.0.0.1:4760` in 2 of 8 runs, run one after another, while that site logged 0 requests with the secret.
- **Root cause:** the builder treated the route as a sender only and moved its removal for a crash fix, without rereading what `recordLeaks` infers from it. The local fake preview answered requests without the secret normally, unlike Vercel's, so no run showed the false alarm.
- **Rung:** none yet
- **Fix:** the code is fixed in PR 306: `shot.ts` reads the list, then removes the route, then closes the browser. For the class, none yet, as a first occurrence.
