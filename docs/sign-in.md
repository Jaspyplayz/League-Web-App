# Sign-in

Players can sign in with **Google** or **Discord**. Signing in with Riot comes later, once Riot approves a production key ([issue #40](https://github.com/Jaspyplayz/League-Web-App/issues/40)).

Accounts are minimal for now: signing in shows your name in the header and nothing else depends on it yet. Focus goals and recent players still live in the browser.

## How it works

Turnpoint uses [Supabase Auth](https://supabase.com/docs/guides/auth), which runs on the same Supabase project as the database. Users live in Supabase's own `auth.users` table, so there's no migration or Drizzle table for them.

Signing in uses **OAuth**, the "Continue with Google" flow most sites use:

1. The player clicks **Continue with Google** on `/sign-in`. The `signIn` server action (`src/app/auth/actions.ts`) asks Supabase for Google's sign-in URL and redirects there.
2. The player signs in on Google's own page, so Turnpoint never sees their password, and approves sharing their name and email.
3. Google sends them to Supabase, and Supabase sends them to `/auth/callback?code=...` on Turnpoint.
4. `src/app/auth/callback/route.ts` trades that one-time code for a **session**: a short-lived access token (1 hour) plus a refresh token, saved in cookies named `sb-...`.
5. On later visits, `src/proxy.ts` swaps an expired access token for a fresh one before the page renders. `getCurrentUser()` in `src/lib/auth.ts` checks the token's signature, so editing the cookie can't fake another user.

The header reads cookies, so the account menu sits in a `<Suspense>` boundary and the rest of the page still prerenders.

## Setup (Jasper)

Everything below happens in dashboards. Secrets go only into the Supabase dashboard, never into code, chat, or `.env.local`.

The callback URL that Google and Discord need is Supabase's, not Turnpoint's:

```
https://vluxomcmexjgqzrfxiry.supabase.co/auth/v1/callback
```

### Google

1. In the [Google Cloud console](https://console.cloud.google.com/), create a project (for example "Turnpoint").
2. In [Google Auth Platform](https://console.cloud.google.com/auth/overview), fill in the app name, support email and the **External** audience. Under **Data Access**, the email and profile scopes are there by default; add `openid`.
3. Under [Clients](https://console.cloud.google.com/auth/clients), create an **OAuth client ID** of type **Web application**:
   - Authorized JavaScript origins: `https://league-web-app.vercel.app` and `http://localhost:3000`
   - Authorized redirect URIs: the Supabase callback URL above
4. Copy the client ID and client secret into Supabase: **Authentication → Sign In / Providers → Google**, and turn it on.

While the Google app is in "Testing" mode, only test users you add can sign in. Publishing it makes it work for everyone; the basic scopes don't need Google's review.

### Discord

1. In the [Discord Developer Portal](https://discord.com/developers/applications), click **New Application** and name it "Turnpoint".
2. Under **OAuth2**, add the Supabase callback URL above as a redirect, then copy the client ID and reset/copy the client secret.
3. Paste both into Supabase: **Authentication → Sign In / Providers → Discord**, and turn it on.

### Supabase URLs

In **Authentication → URL Configuration**:

- Site URL: `https://league-web-app.vercel.app`
- Redirect URLs: `https://league-web-app.vercel.app/**`, `http://localhost:3000/**`, and `https://*-jaspy-s-team.vercel.app/**` for Vercel previews

Supabase only sends players back to addresses on this list; anything else falls back to the Site URL.

### Environment variables

Add these to Vercel (all environments) and `.env.local`, then redeploy:

- `NEXT_PUBLIC_SUPABASE_URL`: `https://vluxomcmexjgqzrfxiry.supabase.co`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: from **Project Settings → API Keys**, the key starting `sb_publishable_`

Both are public by design. Without them the site hides "Sign in" and works as before.

Dashboard names change often, so these steps may not match the screens exactly.
