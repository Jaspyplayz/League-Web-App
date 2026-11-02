# 0006: Send the preview bypass secret only to the preview

Status: draft, waiting on Jasper's "In my words" (issue #156).

## Context

Vercel's preview protection shows a login page to anyone without a Vercel account on the team. The smoke test gets past it with the "Protection Bypass for Automation" secret, sent in the `x-vercel-protection-bypass` header. That one secret opens every preview of the project.

`playwright.config.ts` set the header in `extraHTTPHeaders`, and Playwright adds those to every request the page makes, not only to the preview. Loading the sample game with a fake secret on 2026-10-24, 58 requests to Data Dragon (`ddragon.leagueoflegends.com`) and 1 to Sentry's ingest carried it. In CI that was the real secret, on every preview run.

## Options considered

- **Keep `extraHTTPHeaders`.** It was the leak.
- **Put the secret in the URL** (`?x-vercel-protection-bypass=`). Vercel accepts this for tools that can't set headers, but its docs warn that the URL "may appear in proxy, CDN, and access logs", and the browser would keep it in its history.
- **Send the header once and let Vercel set its bypass cookie** (`x-vercel-set-bypass-cookie`). The browser sends a cookie only to the site that set it. But the first request still needs the header, and the cookie would have to be saved and loaded between tests.
- **Turn preview protection off.** Out of scope: anyone could then open a preview.
- **Fetch each preview request in the route handler without following redirects** (`route.fetch` with `maxRedirects: 0`, then `route.fulfill`). That would keep the header off redirects. The review's probe on 2026-10-24 found that navigations worked this way, but a `fetch()` the preview redirected failed with "Failed to fetch".
- **Add the header in a route handler, only for requests to the preview's origin (chosen).** `npm run shot` already did this (#157), and it got past the login on a real preview.

## Decision

`passPreviewLogin(context, origin)` in `e2e/preview-login.ts` routes every request in a browser context and adds the header only when the request's origin is the preview's. `e2e/fixtures.ts` calls it for each test's context, and every spec that opens a page imports `test` from there. A spec that opens no page and only sends requests with Playwright's `request` fixture, such as `e2e/mcp.spec.ts` (JAS-56), adds the header itself to its requests to the preview's own address and follows no redirects (`maxRedirects: 0`), so a redirect answer fails the test without the header being sent anywhere else. `npm run shot` uses the same function. After each test, the fixture checks which sites the test's requests went to, and fails the test if any site other than the preview got the header. `e2e/preview-secret.spec.ts` checks that this check has something to catch: on the sample game, the preview gets the header and the page also loads from other sites.

## What the check catches

`recordLeaks` in `e2e/preview-login.ts` looks in three ways (JAS-142). The numbers are from Chromium through Playwright 1.64.1 and local servers on 2026-11-01. The tests `the check on redirects` in `e2e/preview-secret.spec.ts` run the main cases in a real browser on every Smoke test, one of them with the Chrome reports below switched off, so a Playwright update that changes this behaviour fails them. They need no preview: `npx playwright test e2e/preview-secret.spec.ts -g "the check on redirects"`.

It catches:
- **A redirect from the preview to another site, as soon as the hop starts**, for what a page itself sends. It doesn't matter if the hop answers, fails or is still running when the test ends. A route runs only on a chain's first request and Playwright adds its headers to every later hop, so whether a hop has the secret follows from where its chain started. Each chain that started on the preview carried it on every hop, in fetches, images and navigations. A chain that started elsewhere carried it on none, even passing through the preview. So Playwright's `request` event and `redirectedFrom()` answer this without asking the browser. The event isn't certain, and the cause isn't known: it never fired for 6 of 1,400 plain redirects in one set of timed runs. Chrome's reports, below, caught all 5 of those that had them on, so no leak got past in those runs. Before this, 25 of 30 such attempts passed while the other site's server logged the secret. Now all 30 fail the test.
- **A keepalive fetch's redirect, once its hop has answered or failed, while its page stays open.** Playwright reports no hop for these: the first looks like a plain 200 and the next fires no event, so 25 of 25 got past the other two ways. Chrome's own protocol (CDP) does show them, so the check attaches to each page and watches there too, which caught 25 of 25. A new tab's first script can start a chain before the watch attaches, so a hop first seen mid-chain counts from the hop before it, which caught 10 of 10 keepalive fetches there, from 0 of 10. With that watch on, a POST racing a page change was missed 0 times in 22 attempts that reached the other site, down from 2 of 23 without it.
- **Any finished request that had the header**, such as from a config that adds it to every request. That's how the first leak happened.

It doesn't catch:
- **Some keepalive fetches.** Chrome seems to report a keepalive hop only once it answers, though that cause isn't confirmed. A hop still running was missed in 10 of 10 attempts, and so was a hop that redirected on to a third site. Keepalive also exists to outlive its page, and the watch ends with the page: a POST followed straight away by a page change reached the other site with the secret, unseen, in 25 of 25 attempts. Nothing in `src/` uses keepalive today. Sentry's reports do, but they go straight to Sentry, so no route adds the secret to them. A keepalive request to the preview that redirected off it would be this case. So would one whose whole chain ran before the watch attached, which didn't happen in those 10 new-tab attempts.
- **A worker's redirect, on a machine with few cores.** The browser sends the hop, and neither Playwright nor Chrome's page reports show it. A dedicated worker's fetch was missed in 0 of 30 attempts on 20 logical cores, 5 of 30 on 8, 14 of 30 on 4 and 30 of 30 on 2. The cause isn't known. Nothing in `src/` starts a worker today.
- **A redirect that starts after the check reads its list.** The browser closes right after the check, so this window is short: a redirect left running at a test's end reached the other site in 0 of 200 attempts. Holding the browser open after the check, the other site got the secret and the check said no leak, in all of 10 attempts.
- **A request that isn't a redirect, has the header, and fails or is still running at the check.** Only a broken route or config could send one, and that would add the header to other requests that do finish. A `no-cors` fetch that gets HTML is one such failure: the other site's server had the header, then Chrome blocked the answer. Reading them wouldn't help: on a request to the preview that was still running, the read said no header while the preview's server logged it.
- **A leak that shows only sometimes, in CI.** CI retries a failed test once (`playwright.config.ts`), so a redirect racing a page change could fail once and pass on the retry, which CI shows as flaky, not failed. A steady redirect fails both tries. The test with Chrome's reports off can show as flaky too, with no leak behind it: when the `request` event goes missing it has nothing else to ask. That test failed in 5 of about 880 runs on these local servers, all on Windows, and in the one that was timed, the event never fired.

It leaves out on purpose:
- **Redirects when no secret is set.** There's no route then, so nothing carries the header. Flagging them would fail harmless runs, such as a preview sending a run with no secret to Vercel's login.

It flags on purpose:
- **A hop that never reaches the other site**, such as when its name doesn't resolve. The secret didn't go out, but that redirect would send it if the site were up.
- **A hop first seen mid-chain, in Chrome's reports, that follows a hop on the preview.** A chain that came from another site and only passed through the preview would count too, if the watch attached after its second hop. That's a false alarm on a shape no page uses, and it fails loudly.

It checks only browser requests in a context from the fixture, the verify-turnpoint scripts and `npm run shot` (JAS-219), which all run Chromium. Each reads the list while its pages are still open. Playwright cancels a header read for a request to another site, or for a redirect hop, when that request's page closes, and the rejection crashes the run. When `npm run shot` closed each page before reading, a page fetching another site without stopping crashed 3 of 4 runs with no leak, and a page redirecting off the preview crashed 3 of 4 before naming the site, with 8 runs at once on 4 cores. `npm run shot` also removes the route that adds the secret before it reads the list. So a request that starts after that has no secret to carry, though a later hop of a chain that started before still does. A route still reading headers as the browser closes can't crash the run either. A spec using Playwright's `request` fixture relies on `maxRedirects: 0` instead, as above.

The way to close the keepalive gap is the route that fetches each preview request without following redirects, listed under Options. A probe on 2026-11-01 found it stopped the secret on the hop, but fetches and images then never reached the other site, so it changes what pages see. That's left for a decision of its own.

## Consequences

Good:
- The secret reaches only the preview on every journey the tests take today. Every test checks this on every preview run, so a future change that brings the leak back fails a test, within the limits above. With the old config, the existing "open the sample analysis" test fails this check on Data Dragon and Sentry.
- The smoke test and `npm run shot` share one function, so a fix to one is a fix to both.

Bad:
- A request that the preview redirects to another site still carries the header, because Playwright also adds a route's headers to the redirects a request follows. No test follows a redirect off the preview today. The fixture fails a test that does, within the limits above, but only after the header has gone out once. Before adding a test that leaves the preview, such as sign-in (#40), switch to Vercel's bypass cookie, which the browser sends only to the preview.
- A new spec has to import `test` from `./fixtures`. One that imports it from `@playwright/test` stops at Vercel's login and fails, which is loud but costs a CI run.
- Playwright's `request` event doesn't show headers a route adds on the chain's first request, so the check reads headers when each request finishes, and works out a redirect's from its chain.
- A trace still records the secret on requests to the preview, so CI keeps no traces, as before.
- The old secret has already been sent to Data Dragon and Sentry. After this merges, and after every branch in progress has merged `main` (an older branch's preview run would still send the new secret out), Jasper makes a new one in Vercel and replaces the GitHub secret and the `.env.local` copy.

## In my words

(Jasper writes this.)
