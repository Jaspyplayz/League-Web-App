import * as Sentry from "@sentry/nextjs";
import type { ErrorEvent } from "@sentry/nextjs";

// When a database query fails, Drizzle's error message is the query, then
// "\nparams: " and every value sent with it: account IDs, PUUIDs, private
// notes, Ask questions and answers. /privacy says only the player sees
// those, so each report keeps the query, whose values are just $1, $2 and so
// on, and drops the rest. Sentry lists an error and its causes side by side,
// so a failed query is cut wherever it sits in that chain.
//
// Sentry also keeps console output as breadcrumbs (a trail of what happened
// before the error), with the logged error in full. Nothing logs a failed
// query today, but a breadcrumb whose text holds the params line is dropped.
// One logged as JSON (JSON.stringify(error)) has no such line and would stay.
function dropQueryParams(event: ErrorEvent): ErrorEvent {
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = exception.value.split("\nparams:")[0];
  }
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.filter((crumb) => !crumb.message?.includes("\nparams:"));
  }
  return event;
}

// Sentry setup for server code running on Node.js (pages, server actions).
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === "production",
  tracesSampleRate: 0.1,
  beforeSend: dropQueryParams,
  integrations: [
    Sentry.httpIntegration({
      // Next.js already traces incoming requests, so @sentry/nextjs sets this
      // too; passing our own http integration replaces that default.
      disableIncomingRequestSpans: true,
      // By default every report quotes the request's body, such as a note
      // being saved or a browser's saved Riot IDs. No report needs it.
      maxRequestBodySize: "none",
    }),
  ],
});
