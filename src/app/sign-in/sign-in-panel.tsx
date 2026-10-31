import { DiscordLogo, GoogleLogo } from "@/components/icons";
import { Panel } from "@/components/ui/panel";
import { signIn } from "@/app/auth/actions";
import { PROVIDERS, safeNextPath, type Provider } from "@/lib/sign-in";

// The sign-in page's panel: the Google and Discord buttons, the message
// after a failed attempt, or a line saying sign-in isn't set up. It takes
// plain values, so the page reads the address and the tests don't need to.

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

export function SignInPanel({
  configured,
  next,
  error,
}: {
  configured: boolean;
  next?: string;
  error?: string;
}) {
  if (!configured) {
    return (
      <Panel className="p-4 text-body text-quiet">
        Sign-in isn&apos;t set up on this copy of the site yet.
      </Panel>
    );
  }

  return (
    <Panel className="flex flex-col gap-2.5 p-4">
      {error && (
        // The problem panel's colours (JAS-93), not red: red only ever means
        // the opponent, and a cancelled sign-in isn't an alarm.
        <p role="alert" className="mb-1 flex items-start gap-2.5 rounded-md bg-raised px-3 py-2.5 text-sm text-main">
          <span
            aria-hidden="true"
            className="mt-px grid size-[18px] shrink-0 place-items-center rounded-full border-[1.5px] border-quiet text-xs font-bold leading-none text-quiet"
          >
            !
          </span>
          <span>{ERRORS[error] ?? ERRORS.start}</span>
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
              className="flex h-12 w-full items-center justify-center gap-3 rounded-md bg-raised px-5 text-body font-semibold text-main hover:bg-divider"
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
