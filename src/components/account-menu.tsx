import Image from "next/image";
import Link from "next/link";
import { cache } from "react";
import { signOut } from "@/app/auth/actions";
import { getCurrentUser } from "@/lib/auth";
import { getDataDragon, profileIconUrl, type DataDragon } from "@/lib/ddragon";
import { formatTier } from "@/lib/match-summary";
import { readMyPlayer } from "@/lib/my-player";
import { savedSoloRank } from "@/lib/profile-store";
import { toSlug } from "@/lib/riot-id";
import { supabaseConfig } from "@/lib/supabase/config";
import { headerLinkClass, hoverFade, iconButton } from "./header-style";
import { SignOutIcon } from "./icons";
import { SignInLink } from "./sign-in-link";

// The right end of the header (JAS-86): Sign in, or who's signed in. Once
// they've picked "This is me" on a profile it shows that player's picture,
// Riot ID and solo rank, all from the database so it costs no Riot calls, as
// one link to their profile, with a sign-out button beside it. Phones show
// only the picture; sign-out moves into the menu (MenuSignOut below).
// Reads cookies, so the header wraps it in <Suspense> and the rest of the
// header can still be prerendered.

// The account and the phone menu's Sign out both ask who's signed in; cache()
// keeps the answer for the rest of the request, so the token is checked once.
const currentUser = cache(getCurrentUser);

export async function AccountMenu() {
  // Hide sign-in entirely where Supabase isn't configured, rather than show a
  // button that can't work.
  if (!supabaseConfig()) return null;

  const user = await currentUser();
  if (!user) {
    // The main button: text-colored with page-colored words. The sign-in page
    // itself doesn't show it.
    return (
      <SignInLink
        hideOnSignInPage
        className="flex h-11 items-center rounded-md bg-main px-3.5 text-body font-medium text-page transition-opacity duration-320 ease-out hover:opacity-85 hover:duration-120 motion-reduce:transition-none lg:h-10 lg:px-4"
      />
    );
  }

  // If the read fails, it says so rather than "no profile marked" (#167).
  const mine = await readMyPlayer(user.id);
  const me = mine.ok ? mine.player : null;
  const [rank, dd] = me
    ? await Promise.all([savedSoloRank(me.puuid), getDataDragon().catch(() => null)])
    : [null, null];
  const name = me?.gameName ?? user.name;
  const picture = <Avatar dd={dd} iconId={me?.profileIconId ?? null} name={name} />;

  const signOutButton = (
    <form action={signOut} className="hidden lg:block">
      <button type="submit" aria-label="Sign out" title="Sign out" className={`${iconButton} lg:w-8`}>
        <SignOutIcon />
      </button>
    </form>
  );

  if (!me) {
    // Signed in, but no profile marked (or it couldn't be read): nothing to
    // link to yet, so the name is plain text with a hint under it.
    const hint = mine.ok ? "No profile marked" : "Couldn't load your profile";
    return (
      <>
        <span
          className="flex h-11 items-center gap-2.5 px-1.5 text-main"
          title={mine.ok ? 'Press "This is me" on your profile to show it here.' : "Reload to try again."}
        >
          {picture}
          <span className="sr-only lg:hidden">{name}</span>
          <span className="hidden max-w-[180px] flex-col leading-tight lg:flex">
            <span className="truncate text-body font-medium">{name}</span>
            <span className="text-note text-quiet">{hint}</span>
          </span>
        </span>
        {signOutButton}
      </>
    );
  }

  const rankText = rank ? formatTier(rank) : "Unranked";
  return (
    <>
      <Link
        href={`/player/${me.region}/${toSlug(me)}`}
        aria-label={`${me.gameName}#${me.tagLine}, ${rankText}. Open your profile`}
        className={`flex h-11 items-center gap-2.5 rounded-md px-1.5 text-main lg:pr-2.5 ${hoverFade}`}
      >
        {picture}
        <span aria-hidden="true" className="hidden max-w-[200px] flex-col leading-tight lg:flex">
          <span className="truncate text-body font-medium">
            {me.gameName} <span className="font-normal text-quiet">#{me.tagLine}</span>
          </span>
          <span className="text-note text-quiet">{rankText}</span>
        </span>
      </Link>
      {signOutButton}
    </>
  );
}

// Sign out, as a row in the phone menu. Renders nothing when signed out.
export async function MenuSignOut() {
  if (!supabaseConfig()) return null;
  if (!(await currentUser())) return null;
  return (
    <form action={signOut} className="flex flex-col">
      <button type="submit" className={`${headerLinkClass(false, true)} text-left`}>
        Sign out
      </button>
    </form>
  );
}

// The player's profile picture, 32px with 6px corners, or their initial on a
// tile when there's no picture (no profile marked, or Data Dragon is down).
function Avatar({ dd, iconId, name }: { dd: DataDragon | null; iconId: number | null; name: string }) {
  if (dd && iconId !== null) {
    return (
      <Image
        src={profileIconUrl(dd, iconId)}
        alt=""
        width={32}
        height={32}
        unoptimized
        className="size-8 shrink-0 rounded-md bg-raised"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex size-8 shrink-0 items-center justify-center rounded-md bg-raised text-sm font-semibold"
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
