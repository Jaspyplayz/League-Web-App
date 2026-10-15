import { defineConfig, devices } from "@playwright/test";

// Browser smoke test (e2e/), run by .github/workflows/smoke.yml against each
// Vercel preview once it has deployed. Locally:
//   BASE_URL=https://<preview>.vercel.app npm run test:e2e
// or start `npm run dev` and run `npm run test:e2e` with no BASE_URL.
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

export default defineConfig({
  testDir: "e2e",
  // Riot can be slow, and the first visit to a preview starts a cold server.
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    // Lets the test through Vercel's preview protection, when it's turned on.
    extraHTTPHeaders: bypass
      ? { "x-vercel-protection-bypass": bypass, "x-vercel-set-bypass-cookie": "true" }
      : undefined,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
