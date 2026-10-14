"use client";

// The main chart: you minus your opponent over the game, with buttons to
// switch between gold, CS, XP and damage. It's a Client Component because
// the buttons change what's shown without reloading the page; the data all
// arrives with the page, so switching is instant.

import { useState } from "react";
import { DiffChart, type TurningPointMarker } from "@/components/diff-chart";
import { PanelHeading } from "@/components/ui/panel-heading";
import { describeDiff } from "@/lib/analyzer/describe";
import { METRICS, type Metric } from "@/lib/analyzer/matchup";
import type { DiffPoint } from "@/lib/diff-chart";
import { LegendSwatch } from "./legend-swatch";
import { panelClass } from "@/components/ui/panel";

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
};

export function LeadChart({ series, markers, opponentName }: Props) {
  const [metric, setMetric] = useState<Metric>("gold");
  const subject = `${METRIC_NAMES[metric]} difference against ${opponentName}`;

  return (
    <section
      aria-labelledby="lead-heading"
      className={`${panelClass} flex min-w-0 flex-[999_1_600px] flex-col gap-[18px] p-6`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PanelHeading id="lead-heading">Lead vs {opponentName}</PanelHeading>
        <div
          role="group"
          aria-label="Stat"
          className="flex gap-1 rounded-[10px] border border-line-strong bg-page p-1"
        >
          {METRICS.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={m === metric}
              onClick={() => setMetric(m)}
              className={`min-h-9 rounded-[7px] px-3.5 text-sm transition-colors ${
                m === metric ? "bg-line-strong text-ink" : "text-muted hover:text-ink"
              }`}
            >
              {METRIC_NAMES[m]}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-[18px] text-[13px] text-muted">
        <LegendSwatch className="bg-ahead">You ahead</LegendSwatch>
        <LegendSwatch className="bg-behind">You behind</LegendSwatch>
      </div>
      {/* On phones the chart keeps a readable size and scrolls sideways. */}
      <div className="overflow-x-auto">
        <div className="min-w-[600px]">
          <DiffChart
            points={series[metric]}
            markers={metric === "gold" ? markers : []}
            description={describeDiff(series[metric], subject)}
          />
        </div>
      </div>
    </section>
  );
}
