import Image from "next/image";
import { RiotErrorNotice } from "@/components/riot-error-notice";
import {
  championIconUrl,
  championName,
  getDataDragon,
  itemIconUrl,
  type DataDragon,
} from "@/lib/ddragon";
import {
  formatDuration,
  summarizeMatch,
  summarizeRecord,
  timeAgo,
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

export async function RecentMatches({ region, puuid }: { region: Region; puuid: string }) {
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
                <ChampionIcon dd={dd} name={c.championName} size={32} />
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
            <MatchRow key={m.matchId} match={m} dd={dd} now={now} />
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

function MatchRow({
  match: m,
  dd,
  now,
}: {
  match: MatchSummary;
  dd: DataDragon | null;
  now: number;
}) {
  const result = m.remake ? "Remake" : m.win ? "Win" : "Loss";
  const resultColor = m.remake ? "text-zinc-500" : m.win ? "text-blue-500" : "text-amber-500";

  return (
    <li className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800">
      <div className="flex w-28 flex-col text-xs whitespace-nowrap text-zinc-500">
        <span className={`text-base font-semibold uppercase ${resultColor}`}>{result}</span>
        <span>{m.queue}</span>
        <span className="font-mono">
          {timeAgo(m.startedAt, now)} · {formatDuration(m.durationS)}
        </span>
      </div>

      <div className="flex min-w-36 flex-1 items-center gap-3">
        <ChampionIcon dd={dd} name={m.championName} size={44} />
        <div>
          <p className="font-medium">{championName(dd, m.championName)}</p>
          {m.position && <p className="text-sm text-zinc-500">{m.position}</p>}
        </div>
      </div>

      <div className="w-24 font-mono whitespace-nowrap">
        <p>
          {m.kills} / {m.deaths} / {m.assists}
        </p>
        <p className="text-xs text-zinc-500">{m.kda.toFixed(1)} KDA</p>
      </div>

      <div className="w-24 font-mono whitespace-nowrap">
        <p>{m.cs} CS</p>
        <p className="text-xs text-zinc-500">{m.csPerMin.toFixed(1)}/min</p>
      </div>

      {dd && <Items dd={dd} items={m.items} />}
    </li>
  );
}

function Items({ dd, items }: { dd: DataDragon; items: number[] }) {
  return (
    <ul aria-label="Items" className="flex gap-1">
      {items.map((id, slot) => (
        // Slots can repeat item ids (two of the same item), so key by slot.
        <li key={slot} className="size-7 overflow-hidden rounded bg-zinc-200 dark:bg-zinc-800">
          {id > 0 && <Image src={itemIconUrl(dd, id)} alt="" width={28} height={28} unoptimized />}
        </li>
      ))}
    </ul>
  );
}

function ChampionIcon({ dd, name, size }: { dd: DataDragon | null; name: string; size: number }) {
  if (!dd) {
    return (
      <div
        style={{ width: size, height: size }}
        className="flex shrink-0 items-center justify-center rounded-lg bg-zinc-200 text-xs font-semibold dark:bg-zinc-800"
      >
        {name.slice(0, 2)}
      </div>
    );
  }
  return (
    <Image
      src={championIconUrl(dd, name)}
      alt=""
      width={size}
      height={size}
      unoptimized
      className="shrink-0 rounded-lg"
    />
  );
}
