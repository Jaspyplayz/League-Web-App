import { ChampionIcon } from "@/components/game-icons";
import { panelClass } from "@/components/ui/panel";
import { championName, type DataDragon } from "@/lib/ddragon";
import { formatPoints, masteryMarks } from "@/lib/mastery";
import type { Region } from "@/lib/regions";
import type { ChampionMastery } from "@/lib/riot/types";
import { getTopMasteries } from "@/lib/riot/api";
import { settle } from "@/lib/riot/client";

// "Champion mastery" in the profile's side column: the four champions the
// player has the most mastery points on, over their whole account. Season
// 2026 above it only counts this season's games, so together they show both
// the long-term pool and what's being played now. Shows nothing if Riot can't
// be reached, since the rest of the profile doesn't need it.
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

  return (
    <section aria-labelledby="mastery-heading" className={`${panelClass} flex flex-col gap-3 px-[18px] py-4`}>
      <h2 id="mastery-heading" className="text-subheading font-semibold">
        Champion mastery
      </h2>
      <ul className="flex flex-col">
        {masteries.value.map((m) => (
          <MasteryRow key={m.championId} mastery={m} dd={dd} />
        ))}
      </ul>
    </section>
  );
}

// One champion: portrait, name, level and any marks toward the next level,
// then the points.
function MasteryRow({ mastery, dd }: { mastery: ChampionMastery; dd: DataDragon | null }) {
  // Data Dragon names champions by id ("MonkeyKing"); mastery by number.
  const id = dd?.championIds[mastery.championId] ?? String(mastery.championId);
  const marks = masteryMarks(mastery);

  return (
    <li className="flex items-center gap-2.5 py-1.5">
      <ChampionIcon dd={dd} name={id} size={32} className="rounded-md" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{championName(dd, id)}</p>
        <p className="text-note text-quiet">
          Level {mastery.championLevel}
          {marks && ` · ${marks.earned} of ${marks.needed} ${marks.needed === 1 ? "mark" : "marks"}`}
        </p>
      </div>
      <div className="text-right tabular-nums">
        <p className="font-semibold">{formatPoints(mastery.championPoints)}</p>
        <p className="text-note text-quiet">points</p>
      </div>
    </li>
  );
}
