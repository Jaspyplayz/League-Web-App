import Link from "next/link";
import { ChampionIcon } from "@/components/game-icons";
import type {
  BenchmarkComparison as Comparison,
  ChampionComparison,
  StatComparison,
} from "@/lib/analyzer/compare";
import { statRowStyle } from "@/lib/analyzer/skill";
import { Gap } from "@/components/ui/gap";
import { formatSigned, plural } from "@/lib/analyzer/format";
import { championClass, championName, type DataDragon } from "@/lib/ddragon";
import { positionName } from "@/lib/match-summary";
import { tierName, type Tier } from "@/lib/tiers";
import { SubHeading } from "@/components/ui/panel-heading";

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
    <div className="flex flex-col gap-3">
      <p className="text-note text-quiet">
        {against.kind === "tier" ? (
          `Each of your games is compared with ${them} players on KR, EUW and NA, using one-tricks on your champion when there are enough of their games.`
        ) : (
          <>
            Each of your games is compared with{" "}
            <Link href={against.href} className="text-main underline underline-offset-2">
              {against.name}
            </Link>
            &apos;s last ranked solo games on the same champion, then the same class, then the same
            role.
          </>
        )}
      </p>
      {/* Scrolls sideways inside the panel on a narrow phone. */}
      <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
        <table className="w-full min-w-[480px] max-w-[880px] text-left text-sm tabular-nums">
          <thead className="text-note text-quiet">
            <tr>
              <th scope="col" className="py-2 pr-3 font-medium">
                Per game
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                You
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                {them}
              </th>
              <th scope="col" className="py-2 pl-3 text-right font-medium">
                Gap
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
      <p className="text-note text-quiet">
        {against.kind === "tier"
          ? `Leads are against each player's own lane opponent, so a ${them} player's lead is over another ${them} player.`
          : `${against.name}'s leads are against their own lane opponents, at their own rank.`}{" "}
        Support games are left out of CS. The map stats use jungle and support games, the other
        jungle stats only jungle games. &ldquo;Stronger side&rdquo; means the side whose lane was
        at least 500 gold better off than the other side&apos;s.
      </p>
    </div>
  );
}

// One stat: its name and game count, your number, theirs, and the gap in
// words, which is the only coloured part: blue ahead, red behind.
function StatRow({ stat }: { stat: StatComparison }) {
  const { label, format, gap } = statRowStyle(stat.key);
  return (
    <tr className="border-t border-divider">
      <th scope="row" className="py-2 pr-3 font-normal">
        <span className="block font-medium">{label}</span>
        <span className="block text-note text-quiet">{plural(stat.games, "game")}</span>
      </th>
      <td className="px-3 py-2 text-right">{format(stat.you)}</td>
      <td className="px-3 py-2 text-right">{format(stat.them)}</td>
      {/* The gap in words, so nobody has to subtract in their head. */}
      <td className="whitespace-nowrap py-2 pl-3 text-right font-medium">
        <Gap you={stat.you} them={stat.them} {...gap} />
      </td>
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
    <div className="flex flex-col gap-1">
      <SubHeading>Gold at 10 on each champion</SubHeading>
      <ul className="grid gap-x-6 sm:grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
        {champions.map((c) => {
          const gold = c.stats.find((s) => s.key === "goldAt10");
          return (
            <li
              key={`${c.position}-${c.championName}`}
              className="flex gap-2.5 border-b border-divider py-2"
            >
              <ChampionIcon dd={dd} name={c.championName} size={32} className="shrink-0 self-start rounded-md" />
              <div className="flex min-w-0 flex-col">
                <p className="text-sm">
                  <span className="font-medium">{championName(dd, c.championName)}</span>{" "}
                  <span className="text-note text-quiet">
                    {positionName(c.position) ?? c.position} · {plural(c.games, "game")}
                  </span>
                </p>
                <p className="text-note text-quiet">{comparedWith(c, against, dd)}</p>
                {gold && (
                  <p className="text-note tabular-nums">
                    {formatSigned(gold.you)} vs {formatSigned(gold.them)} ·{" "}
                    <Gap you={gold.you} them={gold.them} />
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
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
