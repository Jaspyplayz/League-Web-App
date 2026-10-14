import Link from "next/link";
import { Suspense } from "react";
import { toggleMyPlayer } from "@/app/account/actions";
import { getCurrentUser } from "@/lib/auth";
import { readMyPlayer } from "@/lib/my-player";
import { toSlug } from "@/lib/riot-id";
import { supabaseConfig } from "@/lib/supabase/config";

type Props = { region: string; puuid: string; gameName: string; tagLine: string };

const button = "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm transition-colors";
const off = "border-line-strong text-faint hover:border-ahead hover:text-ink";
const on = "border-ahead bg-ahead/15 text-ahead";

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

async function ThisIsMeButton({ region, puuid, gameName, tagLine }: Props) {
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

  const isMine = (await readMyPlayer(user.id))?.puuid === puuid;
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
