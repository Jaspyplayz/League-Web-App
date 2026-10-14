import Link from "next/link";
import { ChampionIcon } from "@/components/game-icons";
import type {
  BenchmarkComparison as Comparison,
  ChampionComparison,
  StatComparison,
  StatKey,
} from "@/lib/analyzer/compare";
import { formatSigned, plural } from "@/lib/analyzer/format";
import { championClass, championName, type DataDragon } from "@/lib/ddragon";
import { positionName } from "@/lib/match-summary";
import { tierName, type Tier } from "@/lib/tiers";

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

// Who your games are compared with: players of one rank on KR, EUW and NA
// (see tier-comparison.tsx), or one player you picked (compare-with-player.tsx).
export type Against = { kind: "tier"; tier: Tier } | { kind: "player"; name: string; href: string };

// "You vs the top of solo queue": your averages next to theirs, matched
// champion by champion (see src/lib/analyzer/compare.ts).
export function BenchmarkComparison({
  comparison,
  against,
  dd,
}: {
  comparison: Comparison;
  against: Against;
  dd: DataDragon | null;
}) {
  const them = against.kind === "tier" ? tierName(against.tier) : against.name;
  return (
    <div className="flex flex-col gap-3.5">
      <p className="text-[15px] text-muted">
        {against.kind === "tier" ? (
          `Each of your games is compared with ${them} players on KR, EUW and NA, using one-tricks on your champion when there are enough of their games.`
        ) : (
          <>
            Each of your games is compared with{" "}
            <Link href={against.href} className="text-ink underline underline-offset-2">
              {against.name}
            </Link>
            &apos;s last ranked solo games on the same champion, then the same class, then the same
            role.
          </>
        )}
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
                {them}
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
      <ChampionList champions={comparison.champions} against={against} dd={dd} />
      <p className="text-[13px] text-faint">
        {against.kind === "tier"
          ? `Leads are against each player's own lane opponent, so a ${them} player's lead is over another ${them} player.`
          : `${against.name}'s leads are against their own lane opponents, at their own rank.`}{" "}
        Support games are left out of CS.
      </p>
    </div>
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
function ChampionList({
  champions,
  against,
  dd,
}: {
  champions: ChampionComparison[];
  against: Against;
  dd: DataDragon | null;
}) {
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
              <span className="text-[13px] text-muted">{comparedWith(c, against, dd)}</span>
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

// "vs 3 Lee Sin one-tricks (45 games)", "vs Gold Fighters in Jungle (80 games)",
// "vs Faker on Ahri (6 games)".
function comparedWith(c: ChampionComparison, against: Against, dd: DataDragon | null): string {
  const name = championName(dd, c.championName);
  const role = positionName(c.position) ?? c.position;
  const games = `(${plural(c.sample.games, "game")})`;
  const champClass = championClass(dd, c.championName);
  if (against.kind === "player") {
    const them = against.name;
    switch (c.level) {
      // One player's games on your champion, whether or not they one-trick it.
      case "one-trick":
      case "champion":
        return `vs ${them} on ${name} ${games}`;
      case "class":
        return `vs ${them} on ${champClass}s in ${role} ${games}`;
      case "role":
        return `vs ${them} in ${role} ${games}`;
      case null:
        return `Not compared: ${them} has too few recent ${role} games`;
    }
  }
  const rank = tierName(against.tier);
  switch (c.level) {
    case "one-trick":
      return `vs ${plural(c.sample.players, `${rank} ${name} one-trick`)} ${games}`;
    case "champion":
      return `vs ${rank} ${name} players ${games}`;
    case "class":
      return `vs ${rank} ${champClass}s in ${role} ${games}`;
    case "role":
      return `vs all ${rank} ${role} players ${games}`;
    case null:
      return `Not compared: too few ${rank} games in this role yet`;
  }
}
