import * as Sentry from "@sentry/nextjs";

// Runs once when a server instance starts. Next.js can run server code in two
// runtimes (Node.js and Edge), and each needs its own Sentry setup.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

// Called by Next.js whenever a server component, server action or route
// handler throws, so those errors reach Sentry too.
export const onRequestError = Sentry.captureRequestError;
