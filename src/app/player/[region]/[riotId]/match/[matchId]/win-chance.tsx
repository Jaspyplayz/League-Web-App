import { DiffChart, type TurningPointMarker } from "@/components/diff-chart";
import { SubHeading } from "@/components/ui/panel-heading";
import { formatClock } from "@/lib/analyzer/format";
import { ALL_RANKS, type WinChanceModel } from "@/lib/analyzer/win-chance";
import type { DiffPoint, MinuteDomain } from "@/lib/diff-chart";
import { describeSwing, type MatchWinChance } from "@/lib/win-chance";
import { LegendSwatch } from "./legend-swatch";
import { MomentRow } from "./turning-points";

// Your team's chance of winning at every minute, from Turnpoint's trained
// win chance model (docs/win-chance.md), and the minutes that moved it most.
// It shows what the game looked like at each moment; it doesn't judge any
// decision. In "How the game went" it sits under the lead chart on the same
// time axis, with its Biggest swings lettered A, B, C so they can't be mixed
// up with the numbered turning points.

const LETTERS = "ABCDEFGHIJ";

export function WinChanceChart({
  chances,
  swings,
  domain,
}: Pick<MatchWinChance, "chances" | "swings"> & { domain: MinuteDomain }) {
  // The chart draws distance from even: +20 is 70%, -20 is 30%.
  const points: DiffPoint[] = chances.map((c) => ({
    minute: c.minute,
    diff: Math.round((c.chance - 0.5) * 1000) / 10,
  }));
  const markers: TurningPointMarker[] = swings.map((s, i) => ({
    minute: s.timestamp / 60_000,
    label: `${formatClock(s.timestamp)} ${percent(s.from)} to ${percent(s.to)}`,
    tone: s.to > s.from ? "ahead" : "behind",
    symbol: LETTERS[i],
  }));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <SubHeading id="win-chance-heading">Win chance</SubHeading>
        <div className="flex flex-wrap gap-[18px] text-note text-muted">
          <LegendSwatch className="bg-ahead">Your team favored</LegendSwatch>
          <LegendSwatch className="bg-behind">Enemy team favored</LegendSwatch>
        </div>
      </div>
      <DiffChart
        points={points}
        markers={markers}
        description={describe(chances)}
        range={{ min: -50, max: 50, step: 25 }}
        formatTick={(v) => `${v + 50}%`}
        domain={domain}
        height={264}
        minuteLines
      />
    </div>
  );
}

// Where the win chance comes from, under the charts.
export function WinChanceNote({ model }: { model: WinChanceModel }) {
  const at20 = model.evaluation.byMinute.find((m) => m.minute === 20);
  return (
    <p className="text-note text-faint">
      Win chance comes from a model trained on {model.games.toLocaleString("en-US")} ranked{" "}
      {model.rank === ALL_RANKS ? "games" : `${model.rank} games, this player's rank`}: how often
      teams in the same spot (gold, XP, kills, towers, dragons, buffs) went on to win.
      {at20 && at20.examples > 0
        ? ` At 20 minutes it picks the winner ${percent(at20.accuracy)} of the time in games it hasn't seen.`
        : ""}
    </p>
  );
}

// The minutes that moved the win chance most, lettered to match the chart.
export function BiggestSwings({ swings }: Pick<MatchWinChance, "swings">) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <SubHeading id="win-chance-swings">Biggest swings</SubHeading>
      {swings.length === 0 ? (
        <p className="py-2.5 text-sm text-muted">
          No single minute moved the win chance much. This one was decided slowly.
        </p>
      ) : (
        <ol aria-labelledby="win-chance-swings" className="flex flex-col">
          {swings.map((s, i) => {
            const { title, detail } = describeSwing(s);
            return (
              <MomentRow
                key={s.timestamp}
                symbol={LETTERS[i]}
                good={s.to > s.from}
                clock={formatClock(s.timestamp)}
                title={title}
                change={`${percent(s.from)} → ${percent(s.to)}`}
                detail={detail}
              />
            );
          })}
        </ol>
      )}
    </div>
  );
}

function percent(chance: number): string {
  return `${Math.round(chance * 100)}%`;
}

// Read by screen readers in place of the chart.
function describe(chances: { minute: number; chance: number }[]): string {
  const best = chances.reduce((a, b) => (b.chance > a.chance ? b : a));
  const worst = chances.reduce((a, b) => (b.chance < a.chance ? b : a));
  const end = chances.at(-1)!;
  return (
    `Your team's chance of winning, minute by minute. It started at 50%, ` +
    `peaked at ${percent(best.chance)} at minute ${Math.round(best.minute)}, ` +
    `was lowest at ${percent(worst.chance)} at minute ${Math.round(worst.minute)}, ` +
    `and was ${percent(end.chance)} at the end.`
  );
}
