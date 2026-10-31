"use client";

import { useId, useState } from "react";
import { Panel } from "@/components/ui/panel";
import { whatIfChance, type WhatIf } from "@/lib/analyzer/win-chance";

// One rank's model to pick from: "All ranks", "Gold", "Master+"...
export type RankWeights = { label: string; weights: number[] };

// Each control's row: the label and value on one line with the control under
// them on a phone, and label, control, value side by side on a wide screen.
const ROW =
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 md:grid-cols-[140px_minmax(0,1fr)_64px] md:gap-3";
const ROW_LABEL = "col-start-1 row-start-1 text-note text-quiet";
const ROW_CONTROL = "col-span-2 row-start-2 md:col-span-1 md:col-start-2 md:row-start-1";
const ROW_VALUE = "col-start-2 row-start-1 text-right font-medium text-main md:col-start-3";

// Sliders for a few leads, and the win chance the real model gives them. It
// runs the same function as the match page, in the browser, so moving a
// slider shows exactly what each lead is worth, and switching the rank shows
// how much the same lead is worth there. The eval bar beside the chance fills
// blue for your side and red for theirs, like a chess eval bar.
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
  const baronLabel = useId();

  return (
    <Panel className="flex flex-col gap-5 p-4 md:flex-row md:items-center md:gap-6 md:p-5">
      <div className="flex flex-col gap-2.5 md:flex-[0_0_200px] md:flex-row md:items-center md:gap-[18px]">
        <EvalBar chance={chance} className="hidden h-[232px] w-3.5 flex-col justify-end md:flex" />
        <div className="flex flex-1 flex-col gap-0.5" aria-live="polite">
          <span className="text-note text-quiet">Your win chance</span>
          <span
            className={`text-[56px] font-bold leading-[1.05] ${chance >= 50 ? "text-ahead" : "text-behind"}`}
          >
            {chance}%
          </span>
          <span className="text-note text-quiet">The same function the match page runs</span>
        </div>
        <EvalBar chance={chance} across className="flex h-3 w-full md:hidden" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3.5">
        {ranks.length > 1 && (
          <label className={ROW}>
            <span className={ROW_LABEL}>Rank</span>
            <select
              value={rank}
              onChange={(e) => setRank(Number(e.target.value))}
              className={`${ROW_CONTROL} h-9 rounded-sm bg-raised px-2 text-body text-main`}
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
        <div role="group" aria-labelledby={baronLabel} className={ROW}>
          <span id={baronLabel} className={ROW_LABEL}>
            Baron buff
          </span>
          <span className="col-span-2 row-start-2 flex flex-wrap gap-1.5 md:col-start-2 md:row-start-1">
            {(
              [
                [1, "Your team"],
                [0, "Nobody"],
                [-1, "Enemy team"],
              ] as const
            ).map(([value, text]) => (
              <button
                key={value}
                type="button"
                aria-pressed={w.baron === value}
                onClick={() => setW((old) => ({ ...old, baron: value }))}
                // 44px on a phone, so a thumb can hit it.
                className={`h-11 rounded-md px-2.5 text-sm font-medium md:h-[34px] ${
                  w.baron === value ? "bg-main text-page" : "bg-raised text-main"
                }`}
              >
                {text}
              </button>
            ))}
          </span>
        </div>
      </div>
    </Panel>
  );
}

// Blue for your share of the chance, red for the rest. Upright beside the
// number on a wide screen, across under it on a phone. The number above
// already says the chance, so screen readers skip the bar.
function EvalBar({
  chance,
  across = false,
  className,
}: {
  chance: number;
  across?: boolean;
  className: string;
}) {
  return (
    <div aria-hidden="true" className={`overflow-hidden rounded-sm bg-behind ${className}`}>
      <div
        className="bg-ahead"
        style={across ? { width: `${chance}%` } : { height: `${chance}%` }}
      />
    </div>
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
    <label className={ROW}>
      <span className={ROW_LABEL}>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`${ROW_CONTROL} m-0 h-7 w-full min-w-0 accent-main`}
      />
      <span className={ROW_VALUE}>{format(value)}</span>
    </label>
  );
}

// "+2,000", "−1", "Even".
function lead(value: number): string {
  if (value === 0) return "Even";
  return `${value > 0 ? "+" : "−"}${Math.abs(value).toLocaleString("en-US")}`;
}
