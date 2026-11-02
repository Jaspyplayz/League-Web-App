# A stress test that never reached the path it was meant to stress

A builder suspects a race and runs a load test to check it, but the test's traffic takes a path that can't fail, so its clean runs say nothing about the race.

## 2026-11-02

- **What happened:** on JAS-219, `scripts/shot.ts` read `recordLeaks`' list after closing each page. The builder saw in Playwright's source that a header read races its page's close, ran 35 times on local pages that fetched without stopping, and cited the clean runs in the PR and decision record 0006. Every one of those fetches went to the preview, where the route had set the headers, and Playwright answers those reads without asking the browser, so the runs never reached the read that fails. A page fetching another site, or following a redirect off the preview, crashed the run under load. The test should have used the requests the race is about (other sites and redirect hops), and the code should have read the list while its pages were open, as `e2e/fixtures.ts` and the verify-turnpoint scripts do.
- **Evidence:** reviewer blocker 1 on PR 306 at 5a1383d (`scripts/shot.ts:121-123` with `e2e/preview-login.ts:39-43`). Reproduced at 5a1383d with 8 runs at once on 4 cores: `--pr 1 /xloop /` crashed in 3 of 4 with `request.allHeaders: Target page, context or browser has been closed` though nothing leaked, and `--pr 1 /hoploop /` crashed in 3 of 4 without printing the LEAK line.
- **Root cause:** the builder took "busy" pages as enough load without checking that their requests went through the read that can fail, and closed pages before the read although `e2e/preview-login.ts:26-31` warns about reads after close and the other three callers read first. Nothing runs `shot.ts` in a test.
- **Rung:** none yet
- **Fix:** the code is fixed in PR 306: `shot.ts` keeps every page open and reads the list before the browser closes. For the class, none yet, as a first occurrence.
