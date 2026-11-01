import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Panel } from "@/components/ui/panel";
import { QUESTIONS_PER_DAY } from "@/lib/ask-rules";
import { supabaseConfig } from "@/lib/supabase/config";
import { SignInPanel } from "./sign-in-panel";

export const metadata: Metadata = {
  title: "Sign in",
};

type SearchParams = Promise<{ next?: string; error?: string }>;

// The page's link style, the same as How it works: the text colour with a
// quiet underline, since blue means you and red the opponent.
const LINK = "text-main underline decoration-quiet underline-offset-[3px] hover:decoration-main";

// What signing in gets you, so a visitor has a reason to. Each one is a
// feature that only works for a signed-in account.
const ACCOUNT_ADDS = [
  { name: "This is me", text: "Mark one profile as yours, and the header links straight to it." },
  { name: "Game notes", text: "A private notes box on every game page, for what you'd do differently." },
  { name: "Ask", text: `Ask Claude about a player's games, ${QUESTIONS_PER_DAY} questions a day.` },
];

export default function SignInPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="mx-auto flex w-full max-w-[432px] flex-col gap-5 px-4 pb-14 pt-8 sm:max-w-[480px] sm:gap-[22px] sm:px-10 sm:pb-[88px] sm:pt-[72px]">
      <div className="flex flex-col gap-2">
        <h1 className="text-title font-semibold">Sign in</h1>
        <p className="text-body text-quiet">
          Use your Google or Discord account. Turnpoint never sees your password.
        </p>
      </div>
      {/* The buttons read ?next= and ?error= from the address, which only exist
          per request, so they stream in behind a boundary. The stand-in is
          the two-button panel's height, so the page doesn't jump. */}
      <Suspense fallback={<Panel className="h-[140px]" />}>
        <SignInOptions searchParams={searchParams} />
      </Suspense>
      <section aria-labelledby="account-adds" className="flex flex-col gap-2">
        <h2 id="account-adds" className="text-body font-semibold">
          What an account adds
        </h2>
        <ul className="flex flex-col gap-2 text-sm text-quiet">
          {ACCOUNT_ADDS.map(({ name, text }) => (
            <li key={name}>
              <span className="font-semibold text-main">{name}.</span> {text}
            </li>
          ))}
        </ul>
      </section>
      <div className="flex flex-col gap-1.5 border-t border-divider pt-3.5 text-note text-quiet">
        <p>Signing in with your Riot account comes once Riot approves the app.</p>
        <p>
          Signing in stores your name and email address. See the{" "}
          <Link href="/privacy" className={LINK}>
            privacy policy
          </Link>
          .
        </p>
      </div>
    </main>
  );
}

// Reads the address, then hands plain values to the panel, so the panel can
// be rendered in a test without a request (sign-in-panel.test.tsx).
async function SignInOptions({ searchParams }: { searchParams: SearchParams }) {
  const { next, error } = await searchParams;
  return <SignInPanel configured={supabaseConfig() !== null} next={next} error={error} />;
}
