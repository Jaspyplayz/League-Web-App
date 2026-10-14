import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseConfig } from "./config";

// Supabase's sign-in token lasts an hour. Pages can't write cookies while
// they render, so this runs first (from src/proxy.ts) and swaps an expired
// token for a fresh one, putting it both on the request the page will read
// and on the response the browser will save. Based on Supabase's Next.js guide.
export async function refreshSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Most visitors never sign in. Their requests carry no Supabase cookie
  // (named sb-<project>-auth-token), so skip the work for them entirely.
  const config = supabaseConfig();
  const hasAuthCookie = request.cookies.getAll().some(({ name }) => name.startsWith("sb-"));
  if (!config || !hasAuthCookie) return response;

  const supabase = createServerClient(config.url, config.key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        // Supabase passes no-cache headers so a CDN never stores one person's
        // fresh cookie and hands it to someone else.
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });

  // getClaims() checks the token and refreshes it when needed, which triggers
  // setAll above. Supabase warns not to run other code between creating the
  // client and this call, or people get signed out at random.
  await supabase.auth.getClaims();

  return response;
}
