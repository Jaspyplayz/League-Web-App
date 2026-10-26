"use client";

// The lead chart in "How the game went": you minus your opponent over the
// game, with buttons to switch between gold, CS, XP and damage. It's a Client
// Component because the buttons change what's shown without reloading the
// page; the data all arrives with the page, so switching is instant.
//
// The win chance chart is drawn underneath it on the same time axis, inside
// the same sideways scroller on phones, so it's passed in as `below`.

import { useState, type ReactNode } from "react";
import { DiffChart, type TurningPointMarker } from "@/components/diff-chart";
import { ChartScroller } from "@/components/ui/chart-scroller";
import { SubHeading } from "@/components/ui/panel-heading";
import { describeDiff } from "@/lib/analyzer/describe";
import { METRICS, type Metric } from "@/lib/analyzer/matchup";
import type { DiffPoint, MinuteDomain } from "@/lib/diff-chart";
import { LegendSwatch } from "./legend-swatch";

const METRIC_NAMES: Record<Metric, string> = {
  gold: "Gold",
  cs: "CS",
  xp: "XP",
  damage: "Damage",
};

type Props = {
  series: Record<Metric, DiffPoint[]>;
  // Turning points are found from gold, so they're only marked on that chart.
  markers: TurningPointMarker[];
  opponentName: string;
  // The minutes both charts span, so they line up.
  domain: MinuteDomain;
  // The chart drawn under this one, or null when there's none: then this
  // chart shows the minute labels itself.
  below: ReactNode;
};

export function LeadChart({ series, markers, opponentName, domain, below }: Props) {
  const [metric, setMetric] = useState<Metric>("gold");
  const subject = `${METRIC_NAMES[metric]} difference against ${opponentName}`;

  return (
    <>
      {/* The stat buttons stay outside the scroller so they never scroll off
          screen on phones. */}
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <SubHeading id="lead-heading">Lead vs {opponentName}</SubHeading>
          <div className="flex gap-[18px] text-note text-muted">
            <LegendSwatch className="bg-ahead">You ahead</LegendSwatch>
            <LegendSwatch className="bg-behind">You behind</LegendSwatch>
          </div>
        </div>
        <div
          role="group"
          aria-label="Stat"
          className="soft-round-sm flex gap-1 border border-line-strong bg-page p-1"
        >
          {METRICS.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={m === metric}
              onClick={() => setMetric(m)}
              className={`min-h-9 rounded-lg px-3.5 text-sm transition-colors ${
                m === metric ? "bg-line-strong text-ink" : "text-muted hover:text-ink"
              }`}
            >
              {METRIC_NAMES[m]}
            </button>
          ))}
        </div>
      </div>
      <ChartScroller>
        <DiffChart
          points={series[metric]}
          markers={metric === "gold" ? markers : []}
          description={describeDiff(series[metric], subject)}
          domain={domain}
          height={below ? 240 : 280}
          minuteLabels={!below}
          minuteLines
        />
        {below}
      </ChartScroller>
    </>
  );
}
