import { signOut } from "@/app/auth/actions";
import { getCurrentUser } from "@/lib/auth";
import { supabaseConfig } from "@/lib/supabase/config";
import { SignInLink } from "./sign-in-link";

// The right end of the header: a Sign in link, or the signed-in player's name
// and a Sign out button. Reads cookies, so the header wraps it in <Suspense>
// and the rest of the header can still be prerendered.
export async function AccountMenu({ linkClassName }: { linkClassName: string }) {
  // Hide sign-in entirely where Supabase isn't configured, rather than show a
  // button that can't work.
  if (!supabaseConfig()) return null;

  const user = await getCurrentUser();
  if (!user) return <SignInLink className={linkClassName} />;

  return (
    <div className="flex items-center gap-1">
      <span className="flex items-center gap-2 px-2 text-[15px] text-ink" title={user.name}>
        <span
          aria-hidden="true"
          className="flex size-7 items-center justify-center rounded-full bg-ahead font-mono text-[13px] font-medium uppercase text-page"
        >
          {user.name.charAt(0)}
        </span>
        <span className="max-w-[140px] truncate">{user.name}</span>
      </span>
      <form action={signOut}>
        <button type="submit" className={linkClassName}>
          Sign out
        </button>
      </form>
    </div>
  );
}
