import { ChampionIcon } from "@/components/game-icons";
import { panelClass } from "@/components/ui/panel";
import { championName, type DataDragon } from "@/lib/ddragon";
import { formatPoints, masteryMarks } from "@/lib/mastery";
import type { Region } from "@/lib/regions";
import type { ChampionMastery } from "@/lib/riot/types";
import { getTopMasteries } from "@/lib/riot/api";
import { settle } from "@/lib/riot/client";

// "Champion mastery" in the profile's sidebar: the four champions the player
// has the most mastery points on, over their whole account, side by side.
// Season Champions above it only counts this season's games, so together
// they show both the long-term pool and what's being played now. Shows
// nothing if Riot can't be reached, since the rest of the profile doesn't
// need it.
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
    <section className={`${panelClass} flex flex-col gap-4 p-4`}>
      <h2 className="font-mono text-xs tracking-widest text-faint uppercase">Champion mastery</h2>
      <ul className="grid grid-cols-4 gap-2">
        {masteries.value.map((m) => (
          <MasteryColumn key={m.championId} mastery={m} dd={dd} />
        ))}
      </ul>
    </section>
  );
}

// One champion: portrait with the level crest over its bottom edge, then the
// name, the mark pips and the points.
function MasteryColumn({ mastery, dd }: { mastery: ChampionMastery; dd: DataDragon | null }) {
  // Data Dragon names champions by id ("MonkeyKing"); mastery by number.
  const id = dd?.championIds[mastery.championId] ?? String(mastery.championId);
  const name = championName(dd, id);
  const marks = masteryMarks(mastery);

  return (
    <li className="flex min-w-0 flex-col items-center gap-1.5 text-center">
      <div className="relative pb-3">
        <ChampionIcon dd={dd} name={id} size={52} className="hud-cut-sm border border-frame" />
        <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2">
          <LevelCrest level={mastery.championLevel} />
        </div>
      </div>
      <p className="w-full truncate text-sm font-medium" title={name}>
        {name}
      </p>
      {marks && <MarkPips earned={marks.earned} needed={marks.needed} />}
      <p className="font-mono text-xs leading-tight text-ink-soft">
        {formatPoints(mastery.championPoints)}
        <span className="block text-faint">pts</span>
      </p>
    </li>
  );
}

// Riot doesn't publish mastery crest images in its official assets, so this
// is our own: a small shield in the site's colors with the level inside.
// Level 10 and up gets the bright "ahead" blue, lower levels the steel frame.
function LevelCrest({ level }: { level: number }) {
  const high = level >= 10;
  return (
    <svg
      viewBox="0 0 28 30"
      width={28}
      height={30}
      role="img"
      aria-label={`Mastery level ${level}`}
      className={high ? "text-ahead" : "text-frame"}
    >
      <path
        d="M14 1 L26 6 V16 C26 22 20.5 26.5 14 29 C7.5 26.5 2 22 2 16 V6 Z"
        className="fill-page"
        stroke="currentColor"
        strokeWidth={2}
      />
      <text
        x="14"
        y="18.5"
        textAnchor="middle"
        className="fill-ink font-mono text-[11px] font-semibold"
      >
        {level}
      </text>
    </svg>
  );
}

// Diamonds like the rank track's: filled for marks earned, hollow for the
// ones still needed for the next level.
function MarkPips({ earned, needed }: { earned: number; needed: number }) {
  return (
    <span
      role="img"
      aria-label={`${earned} of ${needed} marks toward the next level`}
      className="flex gap-1.5"
    >
      {Array.from({ length: needed }, (_, i) => (
        <span
          key={i}
          className={`size-1.5 rotate-45 border border-ahead ${i < earned ? "bg-ahead" : "bg-transparent"}`}
        />
      ))}
    </span>
  );
}
