import { ChampionIcon } from "@/components/game-icons";
import { panelClass } from "@/components/ui/panel";
import { championName, type DataDragon } from "@/lib/ddragon";
import { formatThousands, timeAgo } from "@/lib/match-summary";
import type { Region } from "@/lib/regions";
import { getTopMasteries } from "@/lib/riot/api";
import { settle } from "@/lib/riot/client";

// "Champion mastery" in the profile's sidebar: the five champions the player
// has the most mastery points on, over their whole account. Season Champions
// above it only counts this season's games, so together they show both the
// long-term pool and what's being played now. Shows nothing if Riot can't be
// reached, since the rest of the profile doesn't need it.
export async function MasteryCard({
  region,
  puuid,
  dd,
}: {
  region: Region;
  puuid: string;
  dd: DataDragon | null;
}) {
  const masteries = await settle(getTopMasteries(region, puuid));
  if (!masteries.ok || masteries.value.length === 0) return null;

  // A Server Component renders once per request, so reading the clock is fine.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  return (
    <section className={`${panelClass} flex flex-col gap-3 p-4`}>
      <h2 className="font-mono text-xs tracking-widest text-faint uppercase">Champion mastery</h2>
      <ul className="flex flex-col gap-2">
        {masteries.value.map((m) => {
          // Data Dragon names champions by id ("MonkeyKing"); mastery by number.
          const id = dd?.championIds[m.championId] ?? String(m.championId);
          return (
            <li key={m.championId} className="flex items-center gap-3 text-sm">
              <ChampionIcon dd={dd} name={id} size={36} className="rounded-[9px]" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{championName(dd, id)}</p>
                <p className="font-mono text-xs text-faint">
                  Played {timeAgo(m.lastPlayTime, now)}
                </p>
              </div>
              <div className="text-right font-mono text-xs">
                <p className="text-ink">{formatThousands(m.championPoints)} pts</p>
                <p className="text-faint">Level {m.championLevel}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
