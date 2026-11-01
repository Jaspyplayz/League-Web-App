import * as Sentry from "@sentry/nextjs";

// Sentry setup for server code running on Node.js (pages, server actions).
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === "production",
  tracesSampleRate: 0.1,
  integrations: [
    Sentry.httpIntegration({
      // Next.js already traces incoming requests, so @sentry/nextjs sets this
      // too; passing our own http integration replaces that default.
      disableIncomingRequestSpans: true,
      // By default every report quotes the request's body. This one is a
      // browser's saved Riot IDs, which /privacy says are only used to read ranks.
      ignoreRequestBody: (url) => url.startsWith("/api/saved-players"),
    }),
  ],
});
