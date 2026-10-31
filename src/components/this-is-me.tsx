import Link from "next/link";
import { Suspense } from "react";
import { toggleMyPlayer } from "@/app/account/actions";
import { getCurrentUser } from "@/lib/auth";
import { readMyPlayer } from "@/lib/my-player";
import { toSlug } from "@/lib/riot-id";
import { supabaseConfig } from "@/lib/supabase/config";

type Props = { region: string; puuid: string; gameName: string; tagLine: string };

const button = "soft-round-sm inline-flex h-9 items-center gap-1.5 border px-3 text-sm transition-colors";
const off = "border-line-strong text-faint hover:border-ahead hover:text-ink";
const on = "border-ahead bg-ahead/15 text-ahead-soft";

// The "This is me" button next to a player's name. Marking a profile as yours
// adds a My profile link to the header. It depends on who's signed in, which
// comes from cookies, so it streams in after the rest of the profile.
export function ThisIsMe(props: Props) {
  return (
    <Suspense>
      <ThisIsMeButton {...props} />
    </Suspense>
  );
}

// Exported for its tests; pages use ThisIsMe.
export async function ThisIsMeButton({ region, puuid, gameName, tagLine }: Props) {
  if (!supabaseConfig()) return null;

  const user = await getCurrentUser();
  if (!user) {
    // Signed out: the same button, which signs you in and brings you back here.
    const here = `/player/${region}/${toSlug({ gameName, tagLine })}`;
    return (
      <Link
        href={`/sign-in?next=${encodeURIComponent(here)}`}
        title="Sign in to mark this profile as yours"
        className={`${button} ${off}`}
      >
        This is me
      </Link>
    );
  }

  const mine = await readMyPlayer(user.id);
  if (!mine.ok) {
    // We can't tell whether this profile is already yours, so offer nothing
    // that could mark or clear it (#167).
    return (
      <button
        type="button"
        disabled
        title="Couldn't check whether this profile is yours. Reload to try again."
        className={`${button} ${off} cursor-not-allowed opacity-60`}
      >
        This is me
      </button>
    );
  }
  const isMine = mine.player?.puuid === puuid;
  return (
    <form action={toggleMyPlayer}>
      <input type="hidden" name="puuid" value={puuid} />
      <button
        type="submit"
        aria-pressed={isMine}
        title={isMine ? "Not you? Click to unmark this profile" : "Mark this profile as yours"}
        className={`${button} ${isMine ? on : off}`}
      >
        {isMine ? "✓ This is you" : "This is me"}
      </button>
    </form>
  );
}
