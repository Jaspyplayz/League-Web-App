"use client";

// The 60-second review, near the top of the Summary tab: the plays
// you were in that moved your team's chance to win the most (picked in
// src/lib/analyzer/review.ts), each with a question to think over. "Watch in
// replay" opens the Deep dive tab with the replay at that moment, and "Add
// to notes" starts a line about it in your notes (review-links.tsx). Above
// the moments, any personal records the game set (review-records.tsx).
//
// It's a Client Component for those two buttons. The moments arrive ready
// from the server.

import { panelClass } from "@/components/ui/panel";
import { PanelHeading } from "@/components/ui/panel-heading";
import { formatSwing, gradeOf } from "@/lib/analyzer/plays";
import type { Moment } from "@/lib/analyzer/review";
import { GRADE_CHIP } from "./replay-plays";
import { useReviewLinks } from "./review-links";
import { RecordLines } from "./review-records";

export function Review({ moments, notes }: { moments: Moment[]; notes: boolean }) {
  const links = useReviewLinks();

  return (
    <section aria-labelledby="review-heading" className={`${panelClass} flex flex-col gap-5 p-6`}>
      <div className="flex flex-col gap-1.5">
        <PanelHeading id="review-heading">60-second review</PanelHeading>
        <p className="text-sm text-muted">
          Up to three plays you were in that moved your team&apos;s chance to win the most.
          Watch each one in the replay and think the question over. The grade shows what a play did
          to the game, not whether it was the right call.
        </p>
      </div>

      <RecordLines />

      {moments.length === 0 ? (
        <p className="text-sm text-muted">
          You weren&apos;t in any play that moved your team&apos;s chance to win by a point or
          more.
        </p>
      ) : (
        <ol className="grid gap-4 md:grid-cols-3">
          {moments.map((m) => {
            const grade = gradeOf(m.swing);
            return (
              <li
                key={m.at}
                className="flex flex-col gap-3 rounded-[10px] border border-line-strong p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-note text-faint">{m.clock}</span>
                  <span
                    className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-note font-semibold ${GRADE_CHIP[grade]}`}
                  >
                    {grade} {formatSwing(m.swing)}
                  </span>
                </div>
                <p className="font-semibold text-ink">{m.title}</p>
                <p className="text-sm text-muted">
                  Your team&apos;s chance to win went from {percent(m.before)} to{" "}
                  {percent(m.after)}.{m.tempo ? ` ${m.tempo}` : ""}
                </p>
                <div className="flex flex-col gap-1">
                  <p className="font-mono text-label uppercase tracking-[0.12em] text-faint">
                    Think about
                  </p>
                  <p className="text-sm text-ink-soft">{m.question}</p>
                </div>
                {links && (
                  <div className="mt-auto flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => links.watch(m.at)}
                      className="min-h-10 rounded-lg border border-ahead px-4 text-sm font-semibold text-ahead-soft hover:bg-line"
                    >
                      Watch in replay
                    </button>
                    {notes && (
                      <button
                        type="button"
                        onClick={() => links.addNote(m.noteLine)}
                        className="min-h-10 rounded-lg border border-line-strong px-4 text-sm font-semibold text-muted hover:bg-line hover:text-ink"
                      >
                        Add to notes
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

// 0.5234 -> "52.3%", like the replay's plays list.
function percent(chance: number): string {
  return `${(chance * 100).toFixed(1)}%`;
}
