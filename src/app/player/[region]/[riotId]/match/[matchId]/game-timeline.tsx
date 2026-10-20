import type { TurningPointMarker } from "@/components/diff-chart";
import { ChartScroller } from "@/components/ui/chart-scroller";
import { panelClass } from "@/components/ui/panel";
import { PanelHeading } from "@/components/ui/panel-heading";
import type { Metric } from "@/lib/analyzer/matchup";
import type { TurningPoint } from "@/lib/analyzer/turning-points";
import type { DiffPoint, MinuteDomain } from "@/lib/diff-chart";
import type { MatchWinChance } from "@/lib/win-chance";
import { LeadChart } from "./lead-chart";
import { TurningPoints } from "./turning-points";
import { BiggestSwings, WinChanceChart, WinChanceNote } from "./win-chance";

// "How the game went" on the Summary tab: the lead over your opponent and
// your team's win chance stacked on one time axis, so a moment sits at the
// same spot on both, with the turning points (1, 2, 3) and biggest swings
// (A, B, C) listed beside them. Either half can be missing: the lead needs an
// opponent in your role, the win chance a game the model covers.
export function GameTimeline({
  lead,
  turningPoints,
  winChance,
}: {
  lead: {
    series: Record<Metric, DiffPoint[]>;
    markers: TurningPointMarker[];
    opponentName: string;
  } | null;
  turningPoints: TurningPoint[];
  winChance: MatchWinChance | null;
}) {
  if (!lead && !winChance) return null;
  const domain = sharedMinutes([lead?.series.gold, winChance?.chances]);
  const winChanceChart = winChance && (
    <WinChanceChart chances={winChance.chances} swings={winChance.swings} domain={domain} />
  );

  return (
    <section aria-labelledby="game-timeline" className={`${panelClass} flex flex-col gap-5 p-6`}>
      <PanelHeading id="game-timeline">How the game went</PanelHeading>
      <div className="grid gap-x-8 gap-y-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          {lead ? (
            <LeadChart {...lead} domain={domain} below={winChanceChart} />
          ) : (
            <ChartScroller>{winChanceChart}</ChartScroller>
          )}
          {winChance && <WinChanceNote model={winChance.model} />}
        </div>
        {/* Beside the charts on wide screens, under them on narrow ones,
            where the two lists sit side by side while there's room. */}
        <div className="grid content-start gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-1">
          {lead && <TurningPoints points={turningPoints} />}
          {winChance && <BiggestSwings swings={winChance.swings} />}
        </div>
      </div>
    </section>
  );
}

// The first to last minute across every chart, so stacked charts line up
// even if one has a minute the other doesn't.
function sharedMinutes(series: ({ minute: number }[] | undefined)[]): MinuteDomain {
  const minutes = series.flatMap((s) => (s ? [s[0].minute, s[s.length - 1].minute] : []));
  return { first: Math.min(...minutes), last: Math.max(...minutes) };
}
