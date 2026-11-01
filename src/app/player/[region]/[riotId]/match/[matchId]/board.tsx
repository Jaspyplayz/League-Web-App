"use client";

// The board, at the top of the match page's Summary (layout A from JAS-89): the
// gold lead chart with an eval bar beside it, and under it your team's chance
// to win with a grade mark on each play you were in. Click a mark and the eval
// bar and the chart's cursor move to that play, like stepping through a chess
// game's moves. It's a Client Component for that and for the switches; the data
// all arrives with the page, so nothing reloads.

import { useState, type ReactNode } from "react";
import type { TurningPointMarker } from "@/components/diff-chart";
import { FittedDiffChart } from "@/components/fitted-diff-chart";
import { GradeMark } from "@/components/ui/grade-mark";
import { panelClass } from "@/components/ui/panel";
import { PanelHeading } from "@/components/ui/panel-heading";
import { describeDiff } from "@/lib/analyzer/describe";
import { formatSwing } from "@/lib/analyzer/plays";
import { METRICS, type Metric } from "@/lib/analyzer/matchup";
import {
  evalChance,
  markSpot,
  startingPlay,
  stripLeft,
  stripLine,
  type BoardPlay,
} from "@/lib/board";
import type { DiffPoint } from "@/lib/diff-chart";

const METRIC_NAMES: Record<Metric, string> = {
  gold: "Gold",
  cs: "CS",
  xp: "XP",
  damage: "Damage",
};

type View = "lane" | "team";
const VIEW_NAMES: Record<View, string> = { lane: "Vs your opponent", team: "Team" };

// The chart is measured in the browser; until then, guess the wide layout's
// size, so a laptop's chart doesn't move when the page wakes up.
const CHART_GUESS = { width: 780, height: 300 };

export function Board({
  lead,
  teamGold,
  markers,
  chances,
  swings,
  quiet,
  note,
}: {
  // You minus your opponent for each stat. Null with nobody else in your role.
  lead: { series: Record<Metric, DiffPoint[]>; opponentName: string } | null;
  // Your team's gold minus the enemy team's.
  teamGold: DiffPoint[];
  // The turning points, drawn on the gold lead over your opponent.
  markers: TurningPointMarker[];
  // Your team's chance at every second in tenths of a percent, and your plays
  // in game order. Null for games the win chance model doesn't cover: then
  // there's no eval bar or strip.
  chances: { perSecond: number[]; plays: BoardPlay[] } | null;
  // The Biggest swings' letters, so the list beside the board points at the strip.
  swings: { minute: number; letter: string }[];
  // What to say under the strip when the game had no big moments.
  quiet: string[];
  // Where the win chance comes from.
  note: ReactNode;
}) {
  const [view, setView] = useState<View>(lead ? "lane" : "team");
  const [metric, setMetric] = useState<Metric>("gold");
  const [selected, setSelected] = useState(() => startingPlay(chances?.plays ?? []));

  const onLane = view === "lane" && lead !== null;
  const shownMetric = onLane ? metric : "gold";
  const points = onLane ? lead.series[metric] : teamGold;
  const play = chances?.plays[selected] ?? null;
  // Both the chart and the strip run from the game's start to its last second,
  // so a play's mark sits straight under its spot on the chart.
  const lastPoint = points[points.length - 1];

  return (
    <section
      aria-labelledby="board-heading"
      className={`${panelClass} flex flex-col gap-3 p-3 sm:p-4`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PanelHeading id="board-heading">{METRIC_NAMES[shownMetric]} lead</PanelHeading>
        <div className="flex flex-wrap items-center gap-2">
          {onLane && (
            <Switch
              label="Stat"
              options={METRICS.map((m) => ({ value: m, name: METRIC_NAMES[m] }))}
              value={metric}
              onChange={setMetric}
            />
          )}
          {lead ? (
            <Switch
              label="Gold shown"
              options={(["lane", "team"] as const).map((v) => ({
                value: v,
                name: VIEW_NAMES[v],
              }))}
              value={view}
              onChange={setView}
            />
          ) : (
            <span className="text-note text-quiet">Team gold</span>
          )}
        </div>
      </div>

      {!lead && (
        <p className="text-note text-quiet">
          No single enemy played your role this game, so there&apos;s no head-to-head comparison.
          The board shows your team&apos;s gold against theirs.
        </p>
      )}

      <div className="flex gap-3">
        {chances && <EvalBar chance={evalChance(play, chances.perSecond)} />}
        <FittedDiffChart
          className="h-[220px] min-w-0 flex-1 overflow-hidden sm:h-[300px]"
          guess={CHART_GUESS}
          points={points}
          markers={shownMetric === "gold" && onLane ? markers : []}
          description={describeDiff(
            points,
            onLane
              ? `${METRIC_NAMES[metric]} difference against ${lead.opponentName}`
              : "Your team's gold minus the enemy team's",
          )}
          cursor={play?.minute ?? null}
          domain={{ first: points[0].minute, last: lastPoint.minute }}
          lineBySide
        />
      </div>

      {chances && (
        <ChanceStrip
          perSecond={chances.perSecond}
          plays={chances.plays}
          selected={selected}
          onSelect={setSelected}
          swings={swings}
        />
      )}

      {/* Lines up under the chart, past the eval bar and its gap. */}
      <div className={`flex flex-col gap-1 ${chances ? "pl-10" : ""}`}>
        {play && (
          <p aria-live="polite" className="flex flex-wrap items-center gap-x-2 text-note">
            <GradeMark grade={play.grade} size={18} />
            <span className="tabular-nums text-quiet">{play.clock}</span>
            <span>{play.title}</span>
            <span className="tabular-nums text-quiet">
              {play.grade} {formatSwing(play.swing)}
            </span>
          </p>
        )}
        {quiet.map((line) => (
          <p key={line} className="text-note text-quiet">
            {line}
          </p>
        ))}
        {chances && note}
      </div>
    </section>
  );
}

// The thin chess-style bar: your team's chance to win, blue from the bottom and
// red above, with the number on top.
export function EvalBar({ chance }: { chance: number }) {
  const shown = Math.round(chance);
  return (
    <div className="flex w-7 shrink-0 flex-col items-center gap-1.5">
      <span className="text-xs font-semibold tabular-nums">{shown}%</span>
      <div
        role="img"
        aria-label={`Your team's chance to win: ${shown}%`}
        className="flex w-2.5 flex-1 flex-col overflow-hidden rounded-sm"
      >
        <div
          className="bg-behind motion-safe:transition-[flex-grow] motion-safe:duration-300"
          style={{ flexGrow: 100 - chance }}
        />
        <div
          className="bg-ahead motion-safe:transition-[flex-grow] motion-safe:duration-300"
          style={{ flexGrow: chance }}
        />
      </div>
    </div>
  );
}

// Your team's chance to win across the game, on the chart's time axis, with a
// grade mark on each play you were in. The marks are buttons, so the strip is
// also how you pick a play. Everything is placed in percents, so it fits any
// width and draws the same on the server as in the browser.
export function ChanceStrip({
  perSecond,
  plays,
  selected,
  onSelect,
  swings,
}: {
  perSecond: number[];
  plays: BoardPlay[];
  selected: number;
  onSelect: (index: number) => void;
  swings: { minute: number; letter: string }[];
}) {
  return (
    <div className="flex flex-col gap-1 pl-10">
      <p className="pl-8 text-note text-quiet">
        Your team&apos;s chance to win, with the plays you were in
      </p>
      <div className="relative h-[84px]">
        <span
          aria-hidden="true"
          className="absolute left-0 top-1/2 w-6 -translate-y-1/2 text-right text-xs text-quiet tabular-nums"
        >
          50%
        </span>
        {/* The same side margins as the chart's plot (DEFAULT_BOX at 2 units a
            pixel), so a minute sits at the same x on both. */}
        <div className="absolute inset-y-2.5 left-8 right-3">
          <svg
            aria-hidden="true"
            viewBox={`0 0 ${Math.max(1, perSecond.length - 1)} 1000`}
            preserveAspectRatio="none"
            className="absolute inset-0 size-full overflow-visible"
          >
            <line
              x1="0"
              x2={Math.max(1, perSecond.length - 1)}
              y1="500"
              y2="500"
              stroke="var(--color-divider)"
              strokeWidth="1.5"
              strokeDasharray="3 4"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={stripLine(perSecond)}
              fill="none"
              stroke="var(--color-main)"
              strokeWidth="1.5"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {swings.map((s) => (
            <span
              key={s.letter}
              aria-hidden="true"
              className="absolute -top-2.5 -translate-x-1/2 text-xs text-quiet"
              style={{ left: `${stripLeft(s.minute, perSecond)}%` }}
            >
              {s.letter}
            </span>
          ))}
          {plays.map((play, i) => {
            const spot = markSpot(play, perSecond);
            return (
              <button
                key={play.minute}
                type="button"
                onClick={() => onSelect(i)}
                aria-pressed={i === selected}
                aria-label={`${play.clock} ${play.title}, ${play.grade}. Your team's chance to win after it: ${Math.round(play.after * 100)}%`}
                title={`${play.clock} ${play.title}`}
                // 24px wide so close marks don't cover each other, and 44px tall
                // with the invisible ::before, so it's easy to hit on a phone.
                className={`absolute grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full before:absolute before:-inset-y-2.5 before:inset-x-0 before:content-[''] ${
                  i === selected ? "z-10" : "hover:z-10"
                }`}
                style={{ left: `${spot.left}%`, top: `${spot.top}%` }}
              >
                <GradeMark
                  grade={play.grade}
                  size={18}
                  className={
                    i === selected ? "rounded-full ring-2 ring-main ring-offset-2 ring-offset-panel" : ""
                  }
                />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Pressed buttons in a raised strip, for choosing what the chart shows.
function Switch<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; name: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex gap-0.5 rounded-md bg-raised p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={`min-h-10 rounded-sm px-2.5 text-note sm:min-h-8 ${
            o.value === value ? "bg-panel font-semibold text-main" : "text-quiet hover:text-main"
          }`}
        >
          {o.name}
        </button>
      ))}
    </div>
  );
}
