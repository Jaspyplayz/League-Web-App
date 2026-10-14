import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DiscordLogo, GoogleLogo } from "@/components/icons";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Panel } from "@/components/ui/panel";
import { signIn } from "@/app/auth/actions";
import { PROVIDERS, safeNextPath, type Provider } from "@/lib/sign-in";
import { supabaseConfig } from "@/lib/supabase/config";

export const metadata: Metadata = {
  title: "Sign in",
};

type SearchParams = Promise<{ next?: string; error?: string }>;

const LOGOS: Record<Provider, typeof GoogleLogo> = {
  google: GoogleLogo,
  discord: DiscordLogo,
};

// Shown when a sign-in attempt bounces back here with ?error=.
const ERRORS: Record<string, string> = {
  provider: "That sign-in option isn't available.",
  start: "Couldn't start signing in. Please try again.",
  callback: "Signing in didn't finish. If you pressed Cancel, that's fine: try again any time.",
};

export default function SignInPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="mx-auto flex w-full max-w-[460px] flex-col gap-6 px-6 pb-[88px] pt-16">
      <div className="flex flex-col gap-3">
        <Eyebrow>Your account</Eyebrow>
        <h1 className="font-display text-5xl font-bold uppercase tracking-[0.01em]">Sign in</h1>
        <p className="text-muted">
          Use your Google or Discord account. Turnpoint never sees your password. Signing in
          with your Riot account is coming once Riot approves the app.
        </p>
      </div>
      {/* The buttons read ?next= and ?error= from the address, which only exist
          per request, so they stream in behind a boundary. */}
      <Suspense fallback={<Panel className="h-[152px]" />}>
        <SignInOptions searchParams={searchParams} />
      </Suspense>
      <p className="text-sm text-faint">
        Signing in stores your name and email address. See the{" "}
        <Link href="/privacy" className="text-ahead-soft hover:text-ahead-bright">
          privacy policy
        </Link>
        .
      </p>
    </main>
  );
}

async function SignInOptions({ searchParams }: { searchParams: SearchParams }) {
  const { next, error } = await searchParams;

  if (!supabaseConfig()) {
    return (
      <Panel className="p-6 text-muted">
        Sign-in isn&apos;t set up on this copy of the site yet.
      </Panel>
    );
  }

  return (
    <Panel className="flex flex-col gap-3 p-6">
      {error && (
        <p role="alert" className="text-sm text-behind">
          {ERRORS[error] ?? ERRORS.start}
        </p>
      )}
      {/* Each button is its own small form, so it works before any JavaScript
          loads. The hidden fields tell signIn() what was picked. */}
      {(Object.keys(PROVIDERS) as Provider[]).map((provider) => {
        const Logo = LOGOS[provider];
        return (
          <form key={provider} action={signIn}>
            <input type="hidden" name="provider" value={provider} />
            <input type="hidden" name="next" value={safeNextPath(next)} />
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-3 rounded-[10px] border border-line-strong px-5 py-3 font-semibold text-ink transition-colors hover:border-ahead hover:bg-page"
            >
              <Logo />
              Continue with {PROVIDERS[provider]}
            </button>
          </form>
        );
      })}
    </Panel>
  );
}
