import Link from "next/link";
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

// The "Season 2026" panel in the profile's side column: the season's most
// played champions, with each one's games, CS per minute, win rate and KDA,
// for the game mode picked above the games, and a link to the Champions tab.
// Loads in its own Suspense boundary, so the match list doesn't wait for it.
export async function SeasonChampions({
  region,
  puuid,
  profileUpdatedAt,
  queue,
  loadMore,
  dd,
  recent,
  championsHref,
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
  championsHref: string; // the Champions tab, e.g. "/player/na/Name-TAG/champions"
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
        <p className="text-note text-quiet">From the games listed.</p>
      </ChampionBox>
    );
  }

  const title = queue.id === "all" ? SEASON.label : `${SEASON.label} · ${queue.label}`;
  return (
    <ChampionBox
      title={title}
      dd={dd}
      champions={stats.champions}
      link={
        <Link href={championsHref} className={allGamesLinkClass}>
          All {stats.total} games
        </Link>
      }
    >
      {stats.loaded < stats.total && (
        <p className="text-note text-quiet">
          {stats.loaded} of {stats.total} season games loaded so far. More load each time{" "}
          {loadMore ? "the profile is opened" : "the profile's first page is opened"}, and once a
          day for players marked This is me.
        </p>
      )}
    </ChampionBox>
  );
}

// A quiet underlined link in the panel's heading row, as drawn.
const allGamesLinkClass =
  "text-note text-quiet underline underline-offset-[3px] transition-colors duration-320 hover:text-main hover:duration-120 motion-reduce:transition-none";

function ChampionBox({
  title,
  dd,
  champions,
  link,
  children,
}: {
  title: string;
  dd: DataDragon | null;
  link?: React.ReactNode; // beside the heading

  // csPerMin is missing for the recent-games fallback, which doesn't count
  // it, and for a champion played only in Arena, which has no minions.
  champions: { championName: string; games: number; wins: number; kda: number; csPerMin?: number }[];
  children?: React.ReactNode;
}) {
  return (
    <section aria-labelledby="season-heading" className={`${panelClass} flex flex-col gap-3 px-[18px] py-4`}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 id="season-heading" className="text-subheading font-semibold">
          {title}
        </h2>
        {link}
      </div>
      {champions.length === 0 ? (
        <p className="text-body text-quiet">No games in this mode yet.</p>
      ) : (
        <ul className="flex flex-col">
          {champions.slice(0, SHOWN).map((c) => (
            <li key={c.championName} className="flex items-center gap-2.5 py-1.5">
              <ChampionIcon dd={dd} name={c.championName} size={32} className="rounded-md" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{championName(dd, c.championName)}</p>
                <p className="text-note text-quiet tabular-nums">
                  {c.games} games
                  {c.csPerMin !== undefined && ` · ${c.csPerMin.toFixed(1)} CS/min`}
                </p>
              </div>
              <div className="text-right tabular-nums">
                <p className="font-semibold">{Math.round((c.wins / c.games) * 100)}%</p>
                <p className="text-note text-quiet">{c.kda.toFixed(1)} KDA</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {children}
    </section>
  );
}
