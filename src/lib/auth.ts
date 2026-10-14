import "server-only";
import { userFromClaims, type SignedInUser } from "./sign-in";
import { createSupabaseClient } from "./supabase/server";

// Who is signed in on this request, or null. getClaims() checks the token's
// signature, so a visitor can't fake being someone else by editing the cookie
// (Supabase warns never to trust getSession() on the server for that reason).
// Reads cookies, so callers must sit inside a <Suspense> boundary.
export async function getCurrentUser(): Promise<SignedInUser | null> {
  const supabase = await createSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getClaims();
  if (error || !data) return null;

  return userFromClaims(data.claims);
}
