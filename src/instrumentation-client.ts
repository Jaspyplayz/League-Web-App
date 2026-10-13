import * as Sentry from "@sentry/nextjs";

// Runs in the browser before the page becomes interactive, so errors thrown
// while React hydrates are caught as well.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Only report from the live site, not from local `npm run dev`.
  enabled: process.env.NODE_ENV === "production",
  // Record timing for 10% of page loads; enough to spot slow pages while
  // staying inside the free tier.
  tracesSampleRate: 0.1,
});

// Lets Sentry tag each error with the page the user was navigating to.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
