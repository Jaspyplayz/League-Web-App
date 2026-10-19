import { liveGameLabel } from "@/lib/live-game";
import type { Region } from "@/lib/regions";
import { getActiveGame } from "@/lib/riot/api";
import { settle } from "@/lib/riot/client";

// "In game · Ranked Solo · 12 min" next to a player's name while they're in
// a game. Only says that they're playing: nothing about the other players or
// their champions, since that's the live scouting Riot doesn't allow. Shows
// nothing when they aren't in a game or Riot can't be reached, because it's
// a nice extra, not something the page needs.
export async function LiveBadge({ region, puuid }: { region: Region; puuid: string }) {
  const game = await settle(getActiveGame(region, puuid));
  if (!game.ok || !game.value) return null;

  // A Server Component renders once per request, so reading the clock is fine.
  // eslint-disable-next-line react-hooks/purity
  const label = liveGameLabel(game.value, Date.now());
  return (
    <span className="inline-flex items-center gap-2 border border-ahead/50 bg-ahead/10 px-2.5 py-1 font-mono text-xs tracking-wider text-ahead-soft uppercase">
      <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-ahead" />
      {label}
    </span>
  );
}
