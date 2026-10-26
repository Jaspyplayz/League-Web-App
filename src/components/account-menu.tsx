import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { getCurrentUser } from "@/lib/auth";
import { getDataDragon } from "@/lib/ddragon";
import { formatTier } from "@/lib/match-summary";
import { readMyPlayer } from "@/lib/my-player";
import { savedSoloRank } from "@/lib/profile-store";
import { toSlug } from "@/lib/riot-id";
import { supabaseConfig } from "@/lib/supabase/config";
import { AccountDropdown } from "./account-dropdown";
import { ProfileIcon } from "./game-icons";
import { SignInLink } from "./sign-in-link";

// A thin line between the icon buttons and the account, part of this
// component so it disappears along with sign-in when Supabase isn't set up.
const divider = <span aria-hidden="true" className="mx-1.5 h-8 w-px bg-line" />;

const menuItem =
  "px-4 py-2.5 text-left text-[15px] text-ink transition-colors hover:bg-surface-hover";

// The right end of the header, like the League client's corner: a Sign in
// button, or who's signed in. Once they've picked "This is me" on a profile
// it shows that player's icon, Riot ID and solo rank, all from the database
// so it costs no Riot calls. Clicking it opens My profile and Sign out.
// Reads cookies, so the header wraps it in <Suspense> and the rest of the
// header can still be prerendered.
export async function AccountMenu() {
  // Hide sign-in entirely where Supabase isn't configured, rather than show a
  // button that can't work.
  if (!supabaseConfig()) return null;

  const user = await getCurrentUser();
  if (!user) {
    return (
      <>
        {divider}
        <SignInLink className="soft-round-sm flex min-h-10 items-center bg-ahead px-4 font-mono text-xs font-semibold tracking-[0.12em] text-page uppercase transition-colors hover:bg-ahead-soft" />
      </>
    );
  }

  const me = await readMyPlayer(user.id);
  const [rank, dd] = me
    ? await Promise.all([savedSoloRank(me.puuid), getDataDragon().catch(() => null)])
    : [null, null];
  const name = me?.gameName ?? user.name;

  const trigger = (
    <>
      <ProfileIcon dd={dd} iconId={me?.profileIconId ?? null} level={null} name={name} size={40} />
      <span className="hidden max-w-[180px] flex-col sm:flex">
        <span className="truncate font-display text-lg leading-tight font-semibold tracking-[0.06em] uppercase">
          {name}
        </span>
        <span className="font-mono text-[10px] tracking-[0.1em] text-faint uppercase">
          {rank ? `${formatTier(rank)} · ${rank.leaguePoints} LP` : me ? "Unranked" : "Signed in"}
        </span>
      </span>
      <span className="sr-only">Account menu</span>
    </>
  );

  return (
    <>
      {divider}
      <AccountDropdown trigger={trigger}>
        {me ? (
          <Link href={`/player/${me.region}/${toSlug(me)}`} className={menuItem}>
            My profile
          </Link>
        ) : (
          <p className="px-4 py-2.5 text-[13px] text-faint">
            Press &quot;This is me&quot; on your profile to see your rank here.
          </p>
        )}
        <div className="my-1.5 h-px bg-line" />
        <form action={signOut}>
          <button type="submit" className={`${menuItem} w-full text-ink-soft`}>
            Sign out
          </button>
        </form>
      </AccountDropdown>
    </>
  );
}
