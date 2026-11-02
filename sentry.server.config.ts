import * as Sentry from "@sentry/nextjs";
import type { ErrorEvent } from "@sentry/nextjs";

// When a database query fails, Drizzle's error message is the query, then
// "\nparams: " and every value sent with it: account IDs, PUUIDs, private
// notes, Ask questions and answers. /privacy says only the player sees
// those, so each report keeps the query, whose values are just $1, $2 and so
// on, and drops the rest. A cause Sentry adds from the error is in the same
// list, so it's cut too.
function dropQueryParams(event: ErrorEvent): ErrorEvent {
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = exception.value.split("\nparams:")[0];
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
