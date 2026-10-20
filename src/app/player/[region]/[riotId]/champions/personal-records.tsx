import Link from "next/link";
import { ChampionIcon } from "@/components/game-icons";
import { panelClass } from "@/components/ui/panel";
import { PanelHeading, SubHeading } from "@/components/ui/panel-heading";
import { plural } from "@/lib/analyzer/format";
import {
  MIN_RECORD_GAMES,
  RECORD_STATS,
  ROLE_WORDS,
  type Best,
  type RecordStat,
} from "@/lib/analyzer/records";
import { championName, type DataDragon } from "@/lib/ddragon";
import type { SeasonRecords } from "@/lib/record-store";

// "Personal records" at the bottom of the Champions tab: your best this
// season at each record stat, one table per role you played, with a row for
// the whole role and one per champion you played enough in it. Each record
// links to the game that set it. The 60-second review on a game's page says
// when that game set one (see docs/records.md).
//
// Like the champion table, it scrolls sideways on phones with the first
// column pinned.

const PINNED = "sticky left-0 z-10 bg-surface";

export function PersonalRecords({
  records,
  dd,
  playerPath,
}: {
  records: SeasonRecords;
  dd: DataDragon | null;
  playerPath: string; // "/player/na/Name-TAG"
}) {
  return (
    <section
      id="records"
      aria-labelledby="records-heading"
      className={`${panelClass} flex scroll-mt-6 flex-col gap-5 p-6 max-sm:px-4`}
    >
      <div className="flex flex-col gap-1.5">
        <PanelHeading id="records-heading">Personal records</PanelHeading>
        <p className="text-sm text-muted">
          Your best this season at early-game stats that go with winning, from the{" "}
          {plural(records.games, "game")} Turnpoint has read minute by minute (the games
          you&apos;ve opened, and the ones Insights read). A record needs {MIN_RECORD_GAMES} games
          in the role or on the champion. Each one links to the game that set it.
        </p>
      </div>

      {records.roles.length === 0 ? (
        <p className="text-sm text-faint">
          No records yet: they start once {MIN_RECORD_GAMES} games in one role have been read.
          Opening your games, or the Insights tab, reads more of them.
        </p>
      ) : (
        records.roles.map((role) => (
          <div key={role.position} className="flex flex-col gap-2">
            <SubHeading>
              {capitalize(ROLE_WORDS[role.position] ?? role.position)} ·{" "}
              {plural(role.games, "game")}
            </SubHeading>
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left text-note">
                <caption className="sr-only">
                  Your {ROLE_WORDS[role.position]} records, for the role and each champion
                </caption>
                <thead className="font-mono text-label tracking-[0.08em] text-faint uppercase">
                  <tr className="border-b border-line">
                    <th scope="col" className={`${PINNED} py-2 pr-3 font-medium`}>
                      Champion · games
                    </th>
                    {RECORD_STATS.map((stat) => (
                      <th key={stat.id} scope="col" className="px-2 py-2 font-medium whitespace-nowrap">
                        {stat.short}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  <tr>
                    <th scope="row" className={`${PINNED} py-2.5 pr-3 font-normal`}>
                      <span className="flex items-center gap-2.5">
                        <span className="hud-cut-sm flex size-7 shrink-0 items-center justify-center bg-line-strong font-display text-label font-bold text-ink-soft">
                          ALL
                        </span>
                        <span className="font-semibold text-ink">
                          All · <span className="font-mono text-faint">{role.games}</span>
                        </span>
                      </span>
                    </th>
                    <RecordCells best={role.best} playerPath={playerPath} />
                  </tr>
                  {role.champions.map((champion) => (
                    <tr key={champion.championName}>
                      <th scope="row" className={`${PINNED} py-2.5 pr-3 font-normal`}>
                        <span className="flex items-center gap-2.5">
                          <ChampionIcon
                            dd={dd}
                            name={champion.championName}
                            size={28}
                            className="hud-cut-sm"
                          />
                          <span className="max-w-28 truncate font-medium text-ink-soft max-sm:max-w-20">
                            {championName(dd, champion.championName)}
                          </span>
                          <span className="font-mono text-faint">{champion.games}</span>
                        </span>
                      </th>
                      <RecordCells best={champion.best} playerPath={playerPath} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </section>
  );
}

function RecordCells({
  best,
  playerPath,
}: {
  best: Partial<Record<RecordStat, Best>>;
  playerPath: string;
}) {
  return RECORD_STATS.map((stat) => {
    const record = best[stat.id];
    return (
      <td key={stat.id} className="px-2 py-2.5 font-mono whitespace-nowrap">
        {record ? (
          <Link
            href={`${playerPath}/match/${record.matchId}`}
            title={`${stat.title}, of ${plural(record.games, "game")}. Opens the game.`}
            className="text-ink underline decoration-line-strong underline-offset-4 hover:text-ahead-soft hover:decoration-ahead"
          >
            {stat.format(record.value)}
          </Link>
        ) : (
          <span className="text-placeholder" title="Not enough games with this stat yet">
            –
          </span>
        )}
      </td>
    );
  });
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
