import { DiffChart, type TurningPointMarker } from "@/components/diff-chart";
import { panelClass } from "@/components/ui/panel";
import { PanelHeading } from "@/components/ui/panel-heading";
import { formatClock } from "@/lib/analyzer/format";
import { ALL_RANKS, type WinChanceSwing } from "@/lib/analyzer/win-chance";
import type { DiffPoint } from "@/lib/diff-chart";
import { describeSwing, type MatchWinChance } from "@/lib/win-chance";
import { LegendSwatch } from "./legend-swatch";

// Your team's chance of winning at every minute, from Turnpoint's trained
// win chance model (docs/win-chance.md), and the minutes that moved it most.
// It shows what the game looked like at each moment; it doesn't judge any
// decision.
export function WinChance({ chances, swings, model }: MatchWinChance) {
  // The chart draws distance from even: +20 is 70%, -20 is 30%.
  const points: DiffPoint[] = chances.map((c) => ({
    minute: c.minute,
    diff: Math.round((c.chance - 0.5) * 1000) / 10,
  }));
  const markers: TurningPointMarker[] = swings.map((s) => ({
    minute: s.timestamp / 60_000,
    label: `${formatClock(s.timestamp)} ${percent(s.from)} to ${percent(s.to)}`,
    tone: s.to > s.from ? "ahead" : "behind",
  }));
  const at20 = model.evaluation.byMinute.find((m) => m.minute === 20);

  return (
    <div className="flex flex-wrap items-start gap-5">
      <section
        aria-labelledby="win-chance-heading"
        className={`${panelClass} flex min-w-0 flex-[999_1_600px] flex-col gap-[18px] p-6`}
      >
        <PanelHeading id="win-chance-heading">Win chance</PanelHeading>
        <div className="flex flex-wrap gap-[18px] text-note text-muted">
          <LegendSwatch className="bg-ahead">Your team favored</LegendSwatch>
          <LegendSwatch className="bg-behind">Enemy team favored</LegendSwatch>
        </div>
        {/* On phones the chart keeps a readable size and scrolls sideways. */}
        <div className="overflow-x-auto">
          <div className="min-w-[600px]">
            <DiffChart
              points={points}
              markers={markers}
              description={describe(chances)}
              range={{ min: -50, max: 50, step: 25 }}
              formatTick={(v) => `${v + 50}%`}
            />
          </div>
        </div>
        <p className="text-note text-faint">
          From a model trained on {model.games.toLocaleString("en-US")} ranked{" "}
          {model.rank === ALL_RANKS ? "games" : `${model.rank} games, this player's rank`}: how
          often teams in the same spot (gold, XP, kills, towers, dragons, buffs) went on to win.
          {at20 && at20.examples > 0
            ? ` At 20 minutes it picks the winner ${percent(at20.accuracy)} of the time in games it hasn't seen.`
            : ""}
        </p>
      </section>

      <aside
        aria-labelledby="win-chance-swings"
        className="flex min-w-0 flex-[1_1_340px] flex-col gap-3"
      >
        <PanelHeading id="win-chance-swings">Biggest swings</PanelHeading>
        {swings.length === 0 ? (
          <p className={`${panelClass} px-4 py-3.5 text-body text-muted`}>
            No single minute moved the win chance much. This one was decided slowly.
          </p>
        ) : (
          <ol className="flex flex-col gap-2.5">
            {swings.map((s, i) => (
              <Swing key={s.timestamp} swing={s} number={i + 1} />
            ))}
          </ol>
        )}
      </aside>
    </div>
  );
}

function Swing({ swing: s, number }: { swing: WinChanceSwing; number: number }) {
  const color = s.to > s.from ? "text-ahead-soft border-ahead" : "text-behind border-behind";
  const { title, detail } = describeSwing(s);

  return (
    <li className={`${panelClass} flex items-start gap-3.5 px-4 py-3.5`}>
      <span
        aria-hidden="true"
        className={`flex size-7 flex-none items-center justify-center rounded-full border-2 font-mono text-note font-medium ${color}`}
      >
        {number}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-baseline justify-between gap-2.5">
          <p className="text-body font-semibold">
            <span className="font-mono font-medium text-muted">{formatClock(s.timestamp)}</span>{" "}
            {title}
          </p>
          <span className={`flex-none font-mono text-note ${color}`}>
            {percent(s.from)} → {percent(s.to)}
          </span>
        </div>
        {detail && <p className="text-sm text-muted">{detail}</p>}
      </div>
    </li>
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
