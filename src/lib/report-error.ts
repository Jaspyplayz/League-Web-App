import * as Sentry from "@sentry/nextjs";

// Sends an error that reached an error page to Sentry, once.
//
// An error thrown while the server drew the page was already sent by
// onRequestError (src/instrumentation.ts). The browser only gets a stripped
// copy of it with a `digest` (an ID Next.js adds), so sending that copy too
// would file every server crash twice, the second time with no message.
// Errors thrown in the browser have no digest and are sent here.
export function reportError(error: Error & { digest?: string }) {
  if (error.digest) return;
  Sentry.captureException(error);
}
