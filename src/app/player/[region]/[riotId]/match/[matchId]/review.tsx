"use client";

// The 60-second review, on the Summary tab: the plays you were in that moved
// your team's chance to win the most (picked in src/lib/analyzer/review.ts),
// each with a question to think over. "Watch in replay" opens the Replay tab at
// that moment, and "Add to notes" starts a line about it in your notes
// (review-links.tsx).
//
// It's a Client Component for those two buttons. The moments arrive ready
// from the server.

import { GradeMark } from "@/components/ui/grade-mark";
import { panelClass } from "@/components/ui/panel";
import { PanelHeading } from "@/components/ui/panel-heading";
import { formatSwing } from "@/lib/analyzer/plays";
import type { Moment } from "@/lib/analyzer/review";
import { useReviewLinks } from "./review-links";

const BUTTON =
  "inline-flex min-h-11 items-center rounded-md bg-panel px-4 text-note font-medium text-main hover:bg-divider";

export function Review({ moments, notes }: { moments: Moment[]; notes: boolean }) {
  const links = useReviewLinks();

  return (
    <section aria-labelledby="review-heading" className={`${panelClass} flex flex-col gap-4 p-5`}>
      <div className="flex flex-col gap-1.5">
        <PanelHeading id="review-heading">60-second review</PanelHeading>
        <p className="text-note text-quiet">
          Up to three plays you were in that moved your team&apos;s chance to win the most.
          Watch each one in the replay and think the question over. The grade shows what a play did
          to the game, not whether it was the right call.
        </p>
      </div>

      {moments.length === 0 ? (
        <p className="text-note text-quiet">
          You weren&apos;t in any play that moved your team&apos;s chance to win by a point or
          more.
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {moments.map((m) => (
            <li key={m.at} className="flex flex-col gap-2.5 rounded-md bg-raised p-3.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-note text-quiet tabular-nums">{m.clock}</span>
                <span className="flex items-center gap-1.5 whitespace-nowrap text-note font-semibold">
                  <GradeMark grade={m.grade} size={18} />
                  {m.grade} {formatSwing(m.swing)}
                </span>
              </div>
              <p className="font-semibold">{m.title}</p>
              <p className="text-note text-quiet">
                Your team&apos;s chance to win went from {percent(m.before)} to {percent(m.after)}.
                {m.tempo ? ` ${m.tempo}` : ""}
              </p>
              <div className="flex flex-col gap-0.5">
                <p className="text-note text-quiet">Think about</p>
                <p className="text-note">{m.question}</p>
              </div>
              {links && (
                <div className="mt-auto flex flex-wrap gap-2 pt-1">
                  <button type="button" onClick={() => links.watch(m.at)} className={BUTTON}>
                    Watch in replay
                  </button>
                  {notes && (
                    <button
                      type="button"
                      onClick={() => links.addNote(m.noteLine)}
                      className={BUTTON}
                    >
                      Add to notes
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

// 0.5234 -> "52.3%", like the replay's plays list.
function percent(chance: number): string {
  return `${(chance * 100).toFixed(1)}%`;
}
