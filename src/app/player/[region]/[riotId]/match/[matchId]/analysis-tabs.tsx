"use client";

import { useMemo, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import {
  ReviewLinksContext,
  type NoteRequest,
  type ReplayRequest,
  type ReviewLinks,
} from "./review-links";

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
//
// The tabs also pass on the 60-second review's buttons (review-links.tsx):
// "Watch in replay" opens Deep dive with the replay at that moment, and "Add
// to notes" puts a line in the notes box on Summary.
export function AnalysisTabs({ summary, deepDive }: { summary: ReactNode; deepDive: ReactNode }) {
  const [tab, setTab] = useState<Tab>("summary");
  const [replayRequest, setReplayRequest] = useState<ReplayRequest | null>(null);
  const [noteRequest, setNoteRequest] = useState<NoteRequest | null>(null);

  const links = useMemo<ReviewLinks>(
    () => ({
      replayRequest,
      noteRequest,
      watch: (ms) => {
        // flushSync draws the Deep dive tab first, so there's a replay to
        // scroll to.
        flushSync(() => {
          setTab("deep");
          setReplayRequest({ ms });
        });
        document
          .getElementById("replay-heading")
          ?.closest("section")
          ?.scrollIntoView({ behavior: "smooth" });
      },
      addNote: (line) => {
        flushSync(() => setNoteRequest({ line }));
        // The box is there only when you're signed in. Otherwise this lands
        // on the "Sign in to keep notes" line in its place.
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
    </ReviewLinksContext>
  );
}
