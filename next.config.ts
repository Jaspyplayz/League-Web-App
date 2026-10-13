import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

// withSentryConfig wraps the normal config so that, at build time, Sentry can
// upload source maps. Those let Sentry show errors against the original
// TypeScript instead of the minified JavaScript the browser actually runs.
// Uploading needs SENTRY_AUTH_TOKEN; without it the build still works and the
// upload is simply skipped.
export default withSentryConfig(nextConfig, {
  org: "jaspys-team",
  project: "turnpoint",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Keep build logs quiet except in CI, where they help debug failed uploads.
  silent: !process.env.CI,
  // Upload source maps for more of the client bundle, for better stack traces.
  widenClientFileUpload: true,
});
