# A page checked only the way an ordinary browser loads it

Next.js hands out a page in more than one way: the copy it stored at build time, a fresh render for the bots on its list (Discord, Slack, Bing and others), and React taking the page over in the browser. A change checked with a normal browser that waits for React can still break the other two.

## 2026-11-02

- **What happened:** to keep a 404 and the whole not-found page in the stored HTML, PR 287 rendered the page in `src/app/[...unmatched]/page.tsx` and called `notFound()` inside `<Suspense>`. Link-preview bots got a 200 from it, and React threw the page away and drew it again as it loaded, wiping a search typed in the meantime. A plain `notFound()` should have been chosen, or the trick checked against those two ways in.
- **Evidence:** [PR 287](https://github.com/Jaspyplayz/League-Web-App/pull/287)'s reviewer blockers at 745f515: "Anything the player types into the big search box before React loads is wiped" and "Bad addresses answer 200 instead of 404 for every user agent in Next's bot list". On its preview, `curl -A "Discordbot/2.0"` on `/no-such-page` gave 200 where the live site gave 404. The interrogate panel's Opus, Sonnet and Haiku reviewers found the same, one or both each.
- **Root cause:** the builder believed the stored file's status and HTML were what every visitor gets, and that React keeps the HTML it finds. It checked with `curl` and Chromium's default user agent, and with tests that wait for React before typing (`waitForReact` in `e2e/search-region.spec.ts`), so neither a bot's fresh render nor React's takeover was tried. No test in the repo used a bot's user agent or looked at the page as React took it over.
- **Rung:** check
- **Fix:** `e2e/search-region.spec.ts` in PR 287: `as a link-preview bot › an address with no route answers 404` and `the not-found page isn't drawn again when React loads`. Both failed 3 of 3 runs on 745f515's build and passed 3 of 3 on the fix.
