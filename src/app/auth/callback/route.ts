import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/sign-in";
import { createSupabaseClient } from "@/lib/supabase/server";

// Step 2 of signing in. Google or Discord sent the player back here with a
// one-time ?code=. Supabase trades it for a session and saves it in cookies,
// then we return the player to the page they started from.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  const supabase = await createSupabaseClient();
  if (code && supabase) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, request.url));
  }

  // No code means the player pressed Cancel, or the code was already used.
  return NextResponse.redirect(new URL("/sign-in?error=callback", request.url));
}
