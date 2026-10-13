// Config for drizzle-kit, the command-line tool that turns src/db/schema.ts
// into SQL migration files (npm run db:generate) and applies them
// (npm run db:migrate).
import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

// Read .env.local the same way `next dev` does.
loadEnvConfig(process.cwd());

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    // Migrations need a session-mode connection, so prefer the direct URL
    // when it's set and fall back to the app's URL otherwise.
    url: process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL ?? "",
  },
});
