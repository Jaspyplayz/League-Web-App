import { defineConfig, devices } from "@playwright/test";

// Browser smoke test (e2e/), run by .github/workflows/smoke.yml against each
// Vercel preview once it has deployed. Locally:
//   BASE_URL=https://<preview>.vercel.app npm run test:e2e
// or start `npm run dev` and run `npm run test:e2e` with no BASE_URL.
export default defineConfig({
  testDir: "e2e",
  // Riot can be slow, and the first visit to a preview starts a cold server.
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    // A trace records every request header, including the bypass secret
    // sent to the preview, and CI uploads failed runs' files where anyone
    // signed in to GitHub can download them. So CI keeps only screenshots;
    // the failing test also prints the page's text into the log
    // (e2e/smoke.spec.ts).
    trace: process.env.CI ? "off" : "retain-on-failure",
    screenshot: process.env.CI ? "only-on-failure" : "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
