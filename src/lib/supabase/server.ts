import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseConfig } from "./config";

// A Supabase client for one request, in Server Components, Server Actions and
// Route Handlers. It reads and writes the sign-in cookies through Next.js, so
// a new one is made per request instead of sharing one between visitors.
// Returns null when sign-in isn't configured (see config.ts).
export async function createSupabaseClient() {
  const config = supabaseConfig();
  if (!config) return null;

  const cookieStore = await cookies();

  return createServerClient(config.url, config.key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components aren't allowed to set cookies. That's fine:
          // src/proxy.ts refreshes the sign-in cookies before the page renders.
        }
      },
    },
  });
}
