"use client";

import { useMemo, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import {
  ReviewLinksContext,
  type NoteRequest,
  type ReplayRequest,
  type ReviewLinks,
} from "./review-links";

type Tab = "summary" | "replay" | "stats";
const TABS: { id: Tab; label: string }[] = [
  { id: "summary", label: "Summary" },
  { id: "replay", label: "Replay" },
  { id: "stats", label: "Stats" },
];

// "Summary | Replay | Stats" under the match header. Summary holds what most
// people come for (scoreboard, verdict, lead and win chance), so the page
// isn't a wall of charts; Replay holds the replay with Ask beside it, and
// Stats the detailed tables.
//
// All three tabs are drawn on the server and stay in the page, only hidden,
// so switching is instant and the replay keeps its spot when you come back.
//
// The tabs also pass on the 60-second review's buttons (review-links.tsx):
// "Watch in replay" opens Replay at that moment, and "Add to notes" puts a
// line in the notes box on Summary.
export function AnalysisTabs({
  summary,
  replay,
  stats,
}: {
  summary: ReactNode;
  replay: ReactNode;
  stats: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("summary");
  const [replayRequest, setReplayRequest] = useState<ReplayRequest | null>(null);
  const [noteRequest, setNoteRequest] = useState<NoteRequest | null>(null);

  const links = useMemo<ReviewLinks>(
    () => ({
      replayRequest,
      noteRequest,
      watch: (ms) => {
        // flushSync draws the Replay tab first, so there's a replay to
        // scroll to.
        flushSync(() => {
          setTab("replay");
          setReplayRequest({ ms });
        });
        document
          .getElementById("replay-heading")
          ?.closest("section")
          ?.scrollIntoView({ behavior: "smooth" });
      },
      addNote: (line) => {
        flushSync(() => setNoteRequest({ line }));
        // The box is there only when you're signed in and your note loaded.
        // Otherwise this lands on the line shown in its place.
        const box = document.getElementById("match-note");
        if (box instanceof HTMLTextAreaElement) {
          box.focus({ preventScroll: true });
          box.setSelectionRange(box.value.length, box.value.length);
          box.scrollIntoView({ behavior: "smooth", block: "center" });
        } else {
          document.getElementById("notes-heading")?.scrollIntoView({ behavior: "smooth" });
        }
      },
    }),
    [replayRequest, noteRequest],
  );

  return (
    <ReviewLinksContext value={links}>
      {/* On phones the three tabs share the bar evenly; from sm up they sit
          at the start, as wide as their labels. */}
      <div
        role="tablist"
        aria-label="Match analysis"
        className="grid grid-cols-3 gap-1 border-b border-divider sm:flex"
      >
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
                ? "border-ahead font-semibold text-main"
                : "border-transparent font-medium text-quiet hover:text-main"
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
          {{ summary, replay, stats }[t.id]}
        </div>
      ))}
    </ReviewLinksContext>
  );
}
