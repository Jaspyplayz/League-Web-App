"use client";

import { useState, type ReactNode } from "react";

type Tab = "summary" | "deep";
const TABS: { id: Tab; label: string }[] = [
  { id: "summary", label: "Summary" },
  { id: "deep", label: "Deep dive" },
];

// "Summary | Deep dive" under the match header. Summary holds what most
// people come for (scoreboard, verdict, lead and win chance), so the page
// isn't a wall of charts; Deep dive holds the replay and the detailed stats.
//
// Both tabs are drawn on the server and stay in the page, only hidden, so
// switching is instant and the replay keeps its spot when you come back.
export function AnalysisTabs({ summary, deepDive }: { summary: ReactNode; deepDive: ReactNode }) {
  const [tab, setTab] = useState<Tab>("summary");

  return (
    <>
      <div role="tablist" aria-label="Match analysis" className="flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-controls={`panel-${t.id}`}
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-[18px] py-3 ${
              tab === t.id
                ? "border-ahead font-semibold text-ink"
                : "border-transparent font-medium text-faint hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {TABS.map((t) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`panel-${t.id}`}
          aria-labelledby={`tab-${t.id}`}
          hidden={tab !== t.id}
          className="flex flex-col gap-7"
        >
          {t.id === "summary" ? summary : deepDive}
        </div>
      ))}
    </>
  );
}
