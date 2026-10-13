import { ChampionIcon } from "@/components/game-icons";
import { MatchRow } from "@/components/match-row";
import { RiotErrorNotice } from "@/components/riot-error-notice";
import { championName, getDataDragon } from "@/lib/ddragon";
import {
  summarizeMatch,
  summarizeRecord,
  topChampions,
  type MatchSummary,
} from "@/lib/match-summary";
import type { Region } from "@/lib/regions";
import { getRecentMatches } from "@/lib/riot/api";
import { settle } from "@/lib/riot/client";

// Each match is one API call, so this is the main cost of a page view:
// 4 calls for the player + 1 per match. Raise it once matches are stored in
// the database and repeat visits stop costing calls.
const MATCH_COUNT = 10;

// playerPath is this player's page, e.g. "/player/na/Name-TAG". Each row
// links to its match analysis under it.
type Props = { region: Region; puuid: string; playerPath: string };

export async function RecentMatches({ region, puuid, playerPath }: Props) {
  const [result, dd] = await Promise.all([
    settle(getRecentMatches(region, puuid, MATCH_COUNT)),
    getDataDragon().catch(() => null),
  ]);
  if (!result.ok) return <RiotErrorNotice error={result.error} />;

  const matches = result.value
    .map((match) => summarizeMatch(match, puuid))
    .filter((m): m is MatchSummary => m !== null);

  if (matches.length === 0) {
    return <p className="text-zinc-600 dark:text-zinc-400">No recent games found.</p>;
  }

  const record = summarizeRecord(matches);
  // React's lint rule warns that reading the clock makes a component give
  // different output each render. This is a Server Component, which renders
  // once per request, so "now" is exactly what we want.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <aside className="flex flex-col gap-4 lg:w-72 lg:shrink-0">
        <section className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="font-mono text-xs tracking-widest text-zinc-500 uppercase">
            Last {record.games} games
          </h2>
          <p className="text-3xl font-semibold">
            <span className="text-blue-500">{record.wins}W</span>{" "}
            <span className="text-amber-500">{record.losses}L</span>
          </p>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Stat label="KDA" value={record.kda.toFixed(1)} />
            <Stat label="CS per min" value={record.csPerMin.toFixed(1)} />
            <Stat
              label="Kill participation"
              value={`${Math.round(record.killParticipation * 100)}%`}
            />
          </dl>
        </section>
        <section className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="font-mono text-xs tracking-widest text-zinc-500 uppercase">Champions</h2>
          <ul className="flex flex-col gap-2">
            {topChampions(matches, 4).map((c) => (
              <li key={c.championName} className="flex items-center gap-3 text-sm">
                <ChampionIcon dd={dd} name={c.championName} size={36} className="rounded-[9px]" />
                <span className="flex-1 font-medium">{championName(dd, c.championName)}</span>
                <span className="font-mono text-zinc-600 dark:text-zinc-400">
                  {c.wins}W {c.games - c.wins}L · {c.kda.toFixed(1)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </aside>

      <section aria-labelledby="matches-heading" className="flex min-w-0 flex-1 flex-col gap-2">
        <h2 id="matches-heading" className="text-xl font-semibold">
          Recent matches
        </h2>
        <ul className="flex flex-col gap-2">
          {matches.map((m) => (
            <MatchRow
              key={m.matchId}
              match={m}
              dd={dd}
              now={now}
              href={`${playerPath}/match/${m.matchId}`}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-zinc-500">{label}</dt>
      <dd className="font-mono text-lg">{value}</dd>
    </div>
  );
}
