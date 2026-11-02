# A browser test proved only on a fast machine

A new browser test passes every time on Jasper's PC, which has 20 logical cores, and fails or goes flaky on a smaller machine such as CI's, so repeat runs here say little about CI.

## 2026-11-01

- **What happened:** on JAS-142's branch, the new test `catches a redirect from a worker` passed 100 of 100 here. With fewer cores the browser sends a worker's redirect and reports nothing, so it failed 5 of 30 on 8 cores, 14 of 30 on 4 and 30 of 30 on 2. It should have been run on few cores before it counted as proof.
- **Evidence:** the reviewer on JAS-142's branch, at 199289e, blocker 1, using Windows CPU affinity. It reproduces with `start /affinity` and `--repeat-each=30`.
- **Root cause:** the builder treated repeat runs and CPU load as covering timing, and neither changes how many cores the browser has. Nothing runs a new browser test on a small machine before the first push.
- **Rung:** none yet
- **Fix:** the test is gone, and decision record 0006 lists a worker's redirect as something the check can miss. Its replacement, `catches a redirect with only Playwright's request event`, was run on 2 and 4 cores before this PR's first push. It isn't steady either: the event it tests goes missing in about 1 run in 200, on any core count. Decision record 0006 says so, and CI's one retry covers it.
