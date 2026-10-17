"use client";

import { useState } from "react";
import { Panel } from "@/components/ui/panel";
import { whatIfChance, type WhatIf } from "@/lib/analyzer/win-chance";

// One rank's model to pick from: "All ranks", "Gold", "Master+"...
export type RankWeights = { label: string; weights: number[] };

// Sliders for a few leads, and the win chance the real model gives them. It
// runs the same function as the match page, in the browser, so moving a
// slider shows exactly what each lead is worth, and switching the rank shows
// how much the same lead is worth there.
export function WhatIfCalculator({ ranks }: { ranks: RankWeights[] }) {
  const [rank, setRank] = useState(0);
  const [w, setW] = useState<WhatIf>({
    minute: 20,
    goldLead: 2000,
    xpLead: 1000,
    dragonLead: 0,
    inhibitorLead: 0,
    baron: 0,
  });
  const set = (key: keyof WhatIf) => (value: number) => setW((old) => ({ ...old, [key]: value }));
  const chance = Math.round(whatIfChance(ranks[rank], w) * 100);

  return (
    <Panel className="flex flex-wrap items-center gap-6 p-5">
      <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-4">
        {ranks.length > 1 && (
          <label className="flex flex-wrap items-center gap-3">
            <span className="w-full font-mono sm:w-44 text-label uppercase tracking-[0.12em] text-faint">
              Rank
            </span>
            <select
              value={rank}
              onChange={(e) => setRank(Number(e.target.value))}
              className="bg-surface py-0.5 text-body text-ink"
            >
              {ranks.map((r, i) => (
                <option key={r.label} value={i}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <Slider
          label="Game time"
          value={w.minute}
          min={5}
          max={40}
          step={1}
          format={(v) => `${v}:00`}
          onChange={set("minute")}
        />
        <Slider
          label="Gold lead"
          value={w.goldLead}
          min={-10000}
          max={10000}
          step={250}
          format={lead}
          onChange={set("goldLead")}
        />
        <Slider
          label="XP lead"
          value={w.xpLead}
          min={-8000}
          max={8000}
          step={250}
          format={lead}
          onChange={set("xpLead")}
        />
        <Slider
          label="Dragon lead"
          value={w.dragonLead}
          min={-4}
          max={4}
          step={1}
          format={lead}
          onChange={set("dragonLead")}
        />
        <Slider
          label="Inhibitors down lead"
          value={w.inhibitorLead}
          min={-3}
          max={3}
          step={1}
          format={lead}
          onChange={set("inhibitorLead")}
        />
        <fieldset className="flex flex-wrap items-center gap-3">
          <legend className="sr-only">Baron buff</legend>
          <span className="w-full font-mono sm:w-44 text-label uppercase tracking-[0.12em] text-faint">
            Baron buff
          </span>
          {(
            [
              [1, "Your team"],
              [0, "Nobody"],
              [-1, "Enemy team"],
            ] as const
          ).map(([value, text]) => (
            <label key={value} className="flex items-center gap-1.5 text-note text-ink-soft">
              <input
                type="radio"
                name="baron"
                checked={w.baron === value}
                onChange={() => setW((old) => ({ ...old, baron: value }))}
                className="accent-ahead"
              />
              {text}
            </label>
          ))}
        </fieldset>
      </div>
      <div className="flex flex-[0_0_auto] flex-col items-center gap-1 px-4" aria-live="polite">
        <span className="font-mono text-label uppercase tracking-[0.12em] text-faint">
          Your win chance
        </span>
        <span
          className={`font-display text-7xl font-bold ${chance >= 50 ? "text-ahead" : "text-behind"}`}
        >
          {chance}%
        </span>
      </div>
    </Panel>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex flex-wrap items-center gap-3">
      <span className="w-full font-mono sm:w-44 text-label uppercase tracking-[0.12em] text-faint">
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="min-w-0 flex-1 accent-ahead"
      />
      <span className="w-20 text-right font-mono text-note text-ink">{format(value)}</span>
    </label>
  );
}

// "+2,000", "-1", "Even".
function lead(value: number): string {
  if (value === 0) return "Even";
  return `${value > 0 ? "+" : "−"}${Math.abs(value).toLocaleString("en-US")}`;
}
