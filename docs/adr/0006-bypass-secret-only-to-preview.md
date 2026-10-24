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
- **Add the header in a route handler, only for requests to the preview's origin (chosen).** `npm run shot` already did this (#157), and it got past the login on a real preview.

## Decision

`passPreviewLogin(context, origin)` in `e2e/preview-login.ts` routes every request in a browser context and adds the header only when the request's origin is the preview's. `e2e/fixtures.ts` calls it for each test's context, and every spec imports `test` from there. `npm run shot` uses the same function. `e2e/preview-secret.spec.ts` loads the sample game and fails if any other site received the header, or if the preview didn't.

## Consequences

Good:
- The secret reaches only the preview. A test checks this on every preview run, so a future change to the config can't bring the leak back unnoticed.
- The smoke test and `npm run shot` share one function, so a fix to one is a fix to both.

Bad:
- A new spec has to import `test` from `./fixtures`. One that imports it from `@playwright/test` stops at Vercel's login and fails, which is loud but costs a CI run.
- Playwright's `request` event doesn't show headers a route adds, so the check reads them when each request finishes. A request that never finishes isn't counted.
- A trace still records the secret on requests to the preview, so CI keeps no traces, as before.
- The old secret has already been sent to Data Dragon and Sentry. After this merges, Jasper makes a new one in Vercel and replaces the GitHub secret and the `.env.local` copy.

## In my words

(Jasper writes this.)
