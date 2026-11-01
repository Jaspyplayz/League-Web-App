# A browser test checked only on the dev server

`next dev` and a production build can answer the same request differently. A new browser test that passes on the dev server can still fail on the preview, because it asserts something production never did.

## 2026-11-01

- **What happened:** PR 262's new `e2e/search-region.spec.ts` asserted that a rejected search shows its error on the 404 page and with JavaScript off. Both passed on `next dev`, then failed the smoke check on the preview, so the PR needed another commit and another review. Both behaviours were already broken on the live site, so running the spec there first would have shown they weren't this PR's to test.
- **Evidence:** [PR 262](https://github.com/Jaspyplayz/League-Web-App/pull/262)'s smoke run at f9718a0: `the 404 page keeps the picked region after a rejected search` and `with JavaScript off › a rejected search still shows its error` failed with `Expected pattern: /^Add the tag after a #/` and `element(s) not found`. On the live site, that search from `/no-such-page` posts and gets `404 /no-such-page`.
- **Root cause:** the builder treated a pass on its local server as proof of what production does. It ran the spec only on `next dev`, because `npm run test:e2e` can't get past a preview's login, and nothing prompted it to run the spec against the live site, which needs no login.
- **Rung:** none yet
- **Fix:** none yet, as a first occurrence. The behaviours themselves are JAS-136 and JAS-137.
