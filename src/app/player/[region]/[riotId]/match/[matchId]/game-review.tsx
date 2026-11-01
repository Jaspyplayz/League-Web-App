"use client";

// Game review, the Summary's right column (layout A from JAS-89), modelled on
// chess.com's game review: your scores, how many plays earned each grade, then
// your plays in time order to step through, with the selected one opened. The
// selection is shared with the board (summary-columns.tsx), so stepping here
// moves the eval bar and the strip's mark too.
//
// The 60-second review's moments are marked in the list. A moment's question
// asks what you knew or saw, and the grade only says what a play did to the
// game: Riot doesn't allow apps to dictate decisions (docs/review.md).

import { useEffect, useRef } from "react";
import { GradeMark, MARK_GRADES, type MarkGrade } from "@/components/ui/grade-mark";
import { panelClass } from "@/components/ui/panel";
import { SubHeading } from "@/components/ui/panel-heading";
import { SectionHeading } from "@/components/ui/section-heading";
import { formatSwing, GRADES } from "@/lib/analyzer/plays";
import type { BoardPlay } from "@/lib/board";
import { useReviewLinks } from "./review-links";

// One of the score tiles: Overall, Early, Mid or Late.
export type ScoreTile = { label: string; span: string; score: number };

export type GameReviewProps = {
  scores: ScoreTile[];
  // Your plays in game order. Null for games the win chance model doesn't
  // cover, which have no grades to count.
  plays: BoardPlay[] | null;
  selected: number;
  onSelect: (index: number) => void;
  // Whether there's a notes box to add to, which needs sign-in to be set up.
  notes: boolean;
};

const RAISED_BUTTON =
  "inline-flex min-h-11 items-center rounded-md bg-raised px-3 text-note font-medium hover:bg-select";

export function GameReview({ scores, plays, selected, onSelect, notes }: GameReviewProps) {
  const links = useReviewLinks();
  const play = plays?.[selected] ?? null;

  return (
    <section
      aria-labelledby="game-review-heading"
      // On a wide screen tall enough to fit it, it stays in view beside the
      // board, and the list of plays gives up height to keep the buttons under
      // it on screen. On a shorter one it scrolls with the page, or the buttons
      // would stay out of reach until the left column ended.
      className={`${panelClass} flex min-w-0 flex-col gap-4 p-4 [@media(min-width:64rem)_and_(min-height:860px)]:sticky [@media(min-width:64rem)_and_(min-height:860px)]:top-4 [@media(min-width:64rem)_and_(min-height:860px)]:max-h-[calc(100dvh-2rem)]`}
    >
      <SectionHeading id="game-review-heading">Game review</SectionHeading>

      {scores.length > 0 && <ScoreTiles scores={scores} />}

      {plays ? (
        <>
          <div className="flex flex-col gap-2">
            <GradeCounts plays={plays} />
            <p className="text-xs text-quiet">
              A grade shows what a play did to the game, not whether it was the right call.
            </p>
          </div>
          <PlayList plays={plays} selected={selected} onSelect={onSelect} notes={notes} />
          {play && <StepButtons selected={selected} count={plays.length} onSelect={onSelect} />}
          {play && links && (
            <button
              type="button"
              onClick={() => links.watch(play.at)}
              className="min-h-11 rounded-md bg-main px-4 font-medium text-page hover:opacity-90"
            >
              Start review in the replay
            </button>
          )}
        </>
      ) : (
        <p className="text-note text-quiet">
          The win chance doesn&apos;t cover this game, so its plays have no grades.
        </p>
      )}
    </section>
  );
}

function ScoreTiles({ scores }: { scores: ScoreTile[] }) {
  return (
    <ul className="grid grid-cols-2 gap-2">
      {scores.map((s) => (
        <li key={s.label} className="flex flex-col rounded-md bg-raised px-3 py-2">
          <span className="text-note">{s.label}</span>
          <span className="text-title font-bold tabular-nums">{s.score}</span>
          <span className="text-xs text-quiet">{s.span}</span>
        </li>
      ))}
    </ul>
  );
}

// How many of your plays earned each grade, for the whole scale. Null for a
// grade the analyzer can't award yet (JAS-85), so it shows a dash rather than
// a 0 that reads as "you had none".
export function gradeCounts(
  plays: Pick<BoardPlay, "grade">[],
): { grade: MarkGrade; count: number | null }[] {
  const real: readonly string[] = GRADES;
  return MARK_GRADES.map((grade) => ({
    grade,
    count: real.includes(grade) ? plays.filter((p) => p.grade === grade).length : null,
  }));
}

function GradeCounts({ plays }: { plays: BoardPlay[] }) {
  return (
    <ul aria-label="Grades of your plays" className="grid grid-cols-2 gap-x-4 gap-y-1">
      {gradeCounts(plays).map(({ grade, count }) => (
        <li
          key={grade}
          className={`flex items-center gap-2 text-note ${count ? "" : "text-quiet"}`}
        >
          <GradeMark grade={grade} size={18} className={count ? "" : "opacity-50"} />
          <span className="flex-1">{grade}</span>
          <span className="font-semibold tabular-nums">{count ?? "–"}</span>
        </li>
      ))}
    </ul>
  );
}

function PlayList({
  plays,
  selected,
  onSelect,
  notes,
}: {
  plays: BoardPlay[];
  selected: number;
  onSelect: (index: number) => void;
  notes: boolean;
}) {
  const list = useRef<HTMLOListElement>(null);
  const opened = useRef<HTMLLIElement>(null);

  // Keep the opened play in view as you step, with the row before it showing
  // so it still reads as a list. This moves only the list: the browser's
  // scrollIntoView would scroll the page too, and take the board off the screen.
  useEffect(() => {
    if (!list.current || !opened.current) return;
    const view = list.current.getBoundingClientRect();
    const row = opened.current.getBoundingClientRect();
    const top = row.top - (opened.current.previousElementSibling?.clientHeight ?? 0);
    if (top < view.top) list.current.scrollTop -= view.top - top;
    else if (row.bottom > view.bottom) {
      // A play taller than the list shows from the row before it.
      list.current.scrollTop += Math.min(row.bottom - view.bottom, top - view.top);
    }
  }, [selected]);

  if (plays.length === 0) {
    return (
      <p className="text-note text-quiet">You weren&apos;t in any fight or epic monster this game.</p>
    );
  }

  const hasMoments = plays.some((p) => p.moment);
  return (
    <div className="flex min-h-48 flex-col gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-x-3">
        <div className="flex items-baseline gap-2">
          <SubHeading>Your plays</SubHeading>
          <span className="text-xs text-quiet tabular-nums">{`${selected + 1} of ${plays.length}`}</span>
        </div>
        {hasMoments && (
          <p className="flex items-center gap-1.5 text-xs text-quiet">
            <MomentChip /> your 60-second review
          </p>
        )}
      </div>
      {!hasMoments && (
        <p className="text-xs text-quiet">
          None moved your team&apos;s chance to win by a point or more, so there&apos;s no 60-second
          review.
        </p>
      )}
      {/* Relative so it also clips the rows' screen reader text, which would
          otherwise make the page taller. The focus outline is drawn inside the
          rows, since this list clips. */}
      <ol ref={list} className="relative flex max-h-[480px] min-h-0 flex-col overflow-y-auto">
        {plays.map((play, i) => (
          <li key={play.at} ref={i === selected ? opened : undefined}>
            <button
              type="button"
              onClick={() => onSelect(i)}
              aria-current={i === selected ? "true" : undefined}
              // Raised rather than select: the swing's red is too faint to read
              // on select in the dark theme.
              className={`flex min-h-11 w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left focus-visible:-outline-offset-2 ${
                i === selected ? "bg-raised" : "hover:bg-raised"
              }`}
            >
              <GradeMark grade={play.grade} />
              <span className="sr-only">{play.grade}</span>
              <span className="w-11 shrink-0 text-note text-quiet tabular-nums">{play.clock}</span>
              <span className="line-clamp-2 min-w-0 flex-1 text-note">{play.title}</span>
              {play.moment && <MomentChip />}
              <span
                className={`text-note tabular-nums ${
                  play.swing > 0 ? "text-ahead" : play.swing < 0 ? "text-behind" : "text-quiet"
                }`}
              >
                {formatSwing(play.swing)}
              </span>
            </button>
            {i === selected && <PlayDetail play={play} notes={notes} />}
          </li>
        ))}
      </ol>
    </div>
  );
}

// Marks a play as one of the 60-second review's moments.
function MomentChip() {
  return (
    <span className="shrink-0 rounded-sm bg-raised px-1 text-xs tabular-nums text-main">
      <span aria-hidden="true">60s</span>
      <span className="sr-only">In your 60-second review</span>
    </span>
  );
}

function PlayDetail({ play, notes }: { play: BoardPlay; notes: boolean }) {
  const links = useReviewLinks();
  const { moment } = play;
  return (
    <div className="flex flex-col gap-2 py-2 pl-[42px] pr-2">
      <p className="text-note text-quiet tabular-nums">
        {play.grade} {formatSwing(play.swing)}. Your team&apos;s chance to win went from{" "}
        {percent(play.before)} to {percent(play.after)}.{moment?.tempo ? ` ${moment.tempo}` : ""}
      </p>
      {moment && (
        <div className="flex flex-col gap-0.5">
          <p className="text-note text-quiet">Think about</p>
          <p className="text-note">{moment.question}</p>
        </div>
      )}
      {/* The buttons come before the events, since a big fight's events can
          run past the bottom of the list. */}
      {links && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => links.watch(play.at)} className={RAISED_BUTTON}>
            Watch in replay
          </button>
          {notes && moment && (
            <button
              type="button"
              onClick={() => links.addNote(moment.noteLine)}
              className={RAISED_BUTTON}
            >
              Add to notes
            </button>
          )}
        </div>
      )}
      <ul className="flex flex-col gap-0.5 text-note tabular-nums">
        {play.lines.map((line, i) => (
          // Index, since two towers falling in the same second read the same.
          <li key={i}>{line}</li>
        ))}
      </ul>
    </div>
  );
}

// First, previous, next and last. At either end they're marked as unavailable
// but stay enabled, so stepping to the last play doesn't lose your keyboard
// focus, as a disabled button would.
export function StepButtons({
  selected,
  count,
  onSelect,
}: {
  selected: number;
  count: number;
  onSelect: (index: number) => void;
}) {
  const last = count - 1;
  const steps: { label: string; to: number; off: boolean; icon: string }[] = [
    { label: "First play", to: 0, off: selected <= 0, icon: "M17 6l-6 6 6 6M7 6v12" },
    { label: "Previous play", to: selected - 1, off: selected <= 0, icon: "M15 6l-6 6 6 6" },
    { label: "Next play", to: selected + 1, off: selected >= last, icon: "M9 6l6 6-6 6" },
    { label: "Last play", to: last, off: selected >= last, icon: "M7 6l6 6-6 6M17 6v12" },
  ];
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {steps.map((step) => (
        <button
          key={step.label}
          type="button"
          aria-label={step.label}
          aria-disabled={step.off}
          title={step.label}
          onClick={() => {
            if (!step.off) onSelect(step.to);
          }}
          className="flex min-h-11 items-center justify-center rounded-md bg-raised hover:bg-select aria-disabled:text-quiet aria-disabled:hover:bg-raised"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d={step.icon} />
          </svg>
        </button>
      ))}
    </div>
  );
}

// 0.5234 -> "52.3%", like the replay's plays list.
function percent(chance: number): string {
  return `${(chance * 100).toFixed(1)}%`;
}
