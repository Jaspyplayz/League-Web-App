import { loneValue } from "@/lib/sign-in";
import { supabaseConfig } from "@/lib/supabase/config";
import { SignInPanel } from "./sign-in-panel";

// A value that's in the address twice comes as an array.
export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Reads the address, then hands plain values to the panel, so the panel can
// be rendered in a test without a request (sign-in-panel.test.tsx). It lives
// outside page.tsx so its own test can check how it reads the address.
export async function SignInOptions({ searchParams }: { searchParams: SearchParams }) {
  const { next, error } = await searchParams;
  return (
    <SignInPanel
      configured={supabaseConfig() !== null}
      next={loneValue(next)}
      error={loneValue(error)}
    />
  );
}
