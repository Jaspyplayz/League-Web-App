import { ChampionIcon } from "@/components/game-icons";
import { championName, type DataDragon } from "@/lib/ddragon";
import type { ChampionStats } from "@/lib/match-summary";
import type { QueueFilter } from "@/lib/queue-filters";
import { queueIds } from "@/lib/queue-filters";
import type { Region } from "@/lib/regions";
import { SEASON } from "@/lib/season";
import { loadSeasonStats } from "@/lib/season-store";
import { panelClass } from "@/components/ui/panel";

// How many champions the box lists.
const SHOWN = 7;

// The "Season 2026" box in the profile's sidebar: the season's most played
// champions, for the game mode picked in the match list's tabs. Loads in its
// own Suspense boundary, so the match list doesn't wait for it.
export async function SeasonChampions({
  region,
  puuid,
  profileUpdatedAt,
  queue,
  loadMore,
  dd,
  recent,
}: {
  region: Region;
  puuid: string;
  profileUpdatedAt: Date;
  queue: QueueFilter;
  // True only on the plain profile page; see src/lib/season-store.ts.
  loadMore: boolean;
  dd: DataDragon | null;
  // The listed games' champions, shown instead when there's no database to
  // remember a season's worth of games.
  recent: ChampionStats[];
}) {
  const stats = await loadSeasonStats(
    region,
    puuid,
    profileUpdatedAt,
    queueIds(queue.filter),
    { loadMore },
  );
  if (!stats) {
    return (
      <ChampionBox title="Champions" dd={dd} champions={recent}>
        <p className="text-xs text-faint">From the games listed.</p>
      </ChampionBox>
    );
  }

  const title = queue.id === "all" ? SEASON.label : `${SEASON.label} · ${queue.label}`;
  return (
    <ChampionBox title={title} dd={dd} champions={stats.champions}>
      {stats.loaded < stats.total ? (
        <p className="text-xs text-faint">
          {stats.loaded} of {stats.total} season games loaded so far. More load each time{" "}
          {loadMore ? "the profile is opened" : "the profile's first page is opened"}.
        </p>
      ) : (
        <p className="text-xs text-faint">All {stats.total} games this season.</p>
      )}
    </ChampionBox>
  );
}

function ChampionBox({
  title,
  dd,
  champions,
  children,
}: {
  title: string;
  dd: DataDragon | null;
  champions: { championName: string; games: number; wins: number; kda: number }[];
  children: React.ReactNode;
}) {
  return (
    <section className={`${panelClass} flex flex-col gap-3 p-4`}>
      <h2 className="font-mono text-xs tracking-widest text-faint uppercase">{title}</h2>
      {champions.length === 0 ? (
        <p className="text-sm text-faint">No games in this mode yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {champions.slice(0, SHOWN).map((c) => (
            <li key={c.championName} className="flex items-center gap-3 text-sm">
              <ChampionIcon dd={dd} name={c.championName} size={36} className="rounded-[9px]" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{championName(dd, c.championName)}</p>
                <p className="font-mono text-xs text-faint">{c.games} games</p>
              </div>
              <div className="text-right font-mono text-xs">
                <p className={c.wins / c.games >= 0.5 ? "text-ahead" : "text-behind"}>
                  {Math.round((c.wins / c.games) * 100)}%
                </p>
                <p className="text-faint">{c.kda.toFixed(1)} KDA</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {children}
    </section>
  );
}
