"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isProvider, safeNextPath } from "@/lib/sign-in";
import { createSupabaseClient } from "@/lib/supabase/server";

// Step 1 of signing in (OAuth). Supabase gives us a Google or Discord URL to
// send the player to. They sign in there, so Turnpoint never sees their
// password, and Google or Discord sends them back to /auth/callback with a
// one-time code.
export async function signIn(formData: FormData) {
  const provider = String(formData.get("provider") ?? "");
  const next = safeNextPath(String(formData.get("next") ?? ""));
  if (!isProvider(provider)) redirect("/sign-in?error=provider");

  const supabase = await createSupabaseClient();
  if (!supabase) redirect("/sign-in");

  // The site's own address: localhost, a Vercel preview or the live site.
  // Browsers always send it with a form submission like this one.
  const origin = (await headers()).get("origin");
  if (!origin) redirect("/sign-in?error=start");
  const callback = new URL("/auth/callback", origin);
  callback.searchParams.set("next", next);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: callback.toString() },
  });
  if (error || !data.url) redirect("/sign-in?error=start");

  redirect(data.url);
}

export async function signOut() {
  const supabase = await createSupabaseClient();
  await supabase?.auth.signOut();
  redirect("/");
}
