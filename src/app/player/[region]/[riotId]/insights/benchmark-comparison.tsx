import { ChampionIcon } from "@/components/game-icons";
import { PanelHeading } from "@/components/ui/panel-heading";
import type {
  BenchmarkComparison as Comparison,
  ChampionComparison,
  StatComparison,
  StatKey,
} from "@/lib/analyzer/compare";
import { formatSigned, plural } from "@/lib/analyzer/format";
import { championClass, championName, type DataDragon } from "@/lib/ddragon";
import { positionName } from "@/lib/match-summary";

const card = "rounded-[14px] border border-line-strong bg-surface";

// How each stat is labeled and shown. Leads are signed ("+250"); rates and
// counts are plain numbers. For deaths, fewer is better.
const STAT_ROWS: Record<StatKey, { label: string; format: (v: number) => string; lowerIsBetter?: boolean }> = {
  goldAt10: { label: "Gold lead at 10", format: formatSigned },
  goldAt15: { label: "Gold lead at 15", format: formatSigned },
  csAt10: { label: "CS lead at 10", format: formatSigned },
  csPerMinEarly: { label: "CS/min, 0 to 10", format: (v) => v.toFixed(1) },
  csPerMinMid: { label: "CS/min, 10 to 20", format: (v) => v.toFixed(1) },
  earlyDeaths: { label: "Deaths before 14:00", format: (v) => v.toFixed(1), lowerIsBetter: true },
};

// "You vs the top of solo queue": your averages next to Challenger players',
// matched champion by champion (see src/lib/analyzer/compare.ts).
export function BenchmarkComparison({
  comparison,
  dd,
}: {
  comparison: Comparison;
  dd: DataDragon | null;
}) {
  return (
    <section aria-labelledby="benchmark-heading" className="flex flex-col gap-3.5">
      <PanelHeading id="benchmark-heading">You vs Challenger</PanelHeading>
      <p className="text-[15px] text-muted">
        Each of your games is compared with Challenger players on KR, EUW and NA, using one-tricks
        on your champion when there are enough of their games.
      </p>
      <div className={`overflow-x-auto ${card}`}>
        <table className="w-full text-left text-sm">
          <thead className="font-mono text-xs uppercase tracking-[0.08em] text-faint">
            <tr>
              <th scope="col" className="px-5 py-3 font-medium">
                Per game
              </th>
              <th scope="col" className="px-5 py-3 text-right font-medium">
                You
              </th>
              <th scope="col" className="px-5 py-3 text-right font-medium">
                Challenger
              </th>
            </tr>
          </thead>
          <tbody>
            {comparison.stats.map((stat) => (
              <StatRow key={stat.key} stat={stat} />
            ))}
          </tbody>
        </table>
      </div>
      <ChampionList champions={comparison.champions} dd={dd} />
      <p className="text-[13px] text-faint">
        Leads are against each player&apos;s own lane opponent, so a Challenger player&apos;s lead
        is over another Challenger player. Support games are left out of CS.
      </p>
    </section>
  );
}

function StatRow({ stat }: { stat: StatComparison }) {
  const { label, format, lowerIsBetter } = STAT_ROWS[stat.key];
  const better = lowerIsBetter ? stat.you <= stat.them : stat.you >= stat.them;
  return (
    <tr className="border-t border-line">
      <th scope="row" className="px-5 py-3 font-normal text-ink-soft">
        {label}
        <span className="block font-mono text-xs text-faint sm:ml-2 sm:inline">
          {plural(stat.games, "game")}
        </span>
      </th>
      <td className={`px-5 py-3 text-right font-mono ${better ? "text-ahead" : "text-behind"}`}>
        {format(stat.you)}
      </td>
      <td className="px-5 py-3 text-right font-mono text-muted">{format(stat.them)}</td>
    </tr>
  );
}

// Who each of your champions was compared with, so a number based on 12
// games isn't mistaken for one based on 300.
function ChampionList({ champions, dd }: { champions: ChampionComparison[]; dd: DataDragon | null }) {
  return (
    <ul className={`flex flex-col divide-y divide-line ${card}`}>
      {champions.map((c) => {
        const gold = c.stats.find((s) => s.key === "goldAt10");
        return (
          <li
            key={`${c.position}-${c.championName}`}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3"
          >
            <ChampionIcon dd={dd} name={c.championName} size={32} className="rounded-lg" />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm">
                {championName(dd, c.championName)}
                <span className="text-faint">
                  {" "}
                  · {positionName(c.position) ?? c.position} · {plural(c.games, "game")}
                </span>
              </span>
              <span className="text-[13px] text-muted">{comparedWith(c, dd)}</span>
            </div>
            {gold && (
              // Below the name on phones, on the right on wider screens.
              <span className="basis-full whitespace-nowrap pl-11 font-mono text-xs text-faint sm:basis-auto sm:pl-0">
                Gold at 10: {formatSigned(gold.you)} vs {formatSigned(gold.them)}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// "vs 3 Lee Sin one-tricks (45 games)", "vs Challenger Fighters in Jungle (80 games)".
function comparedWith(c: ChampionComparison, dd: DataDragon | null): string {
  const name = championName(dd, c.championName);
  const role = positionName(c.position) ?? c.position;
  const games = `(${plural(c.sample.games, "game")})`;
  switch (c.level) {
    case "one-trick":
      return `vs ${plural(c.sample.players, `${name} one-trick`)} ${games}`;
    case "champion":
      return `vs Challenger ${name} players ${games}`;
    case "class":
      return `vs Challenger ${championClass(dd, c.championName)}s in ${role} ${games}`;
    case "role":
      return `vs all Challenger ${role} players ${games}`;
    case null:
      return "Not compared: too few Challenger games in this role yet";
  }
}
