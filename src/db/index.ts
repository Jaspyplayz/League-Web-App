// The one place the app gets a database connection. Server-only: importing
// this from a Client Component fails the build, so the connection string
// (which contains the database password) can never reach the browser.
import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and add the Supabase connection string.",
    );
  }
  // Supabase's pooler (port 6543) runs in transaction mode, which doesn't
  // support prepared statements, so they're turned off.
  const client = postgres(url, { prepare: false, max: 5 });
  return drizzle({ client, schema });
}

export type Db = ReturnType<typeof createDb>;

// Reuse one connection pool per server process. In development, Next.js
// re-runs modules on every edit, so the pool lives on globalThis to avoid
// opening a new one each time.
const globalForDb = globalThis as unknown as { turnpointDb?: Db };

// Connects lazily, on first call, so builds and tests that never touch the
// database don't need DATABASE_URL.
export function getDb(): Db {
  globalForDb.turnpointDb ??= createDb();
  return globalForDb.turnpointDb;
}

export * as tables from "./schema";
