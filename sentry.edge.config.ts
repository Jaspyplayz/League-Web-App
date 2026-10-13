import * as Sentry from "@sentry/nextjs";

// Sentry setup for server code running on the Edge runtime (proxy, edge routes).
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === "production",
  tracesSampleRate: 0.1,
});
