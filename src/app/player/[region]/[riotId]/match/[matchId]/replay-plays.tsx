// The replay's plays: every fight, epic monster and building of the game,
// graded by how much it changed your team's chance to win (worked out in
// src/lib/analyzer/plays.ts). Picking one moves the replay to it and shows
// what happened. Also the two timeline rows that go with it: the win chance
// line and a mark for each play.
//
// It's drawn inside the replay, a Client Component.

import { useState } from "react";
import { formatClock, listNames } from "@/lib/analyzer/format";
import {
  formatSwing,
  gradeOf,
  playLines,
  playStart,
  playSwing,
  playTitle,
  type Grade,
  type Play,
  type ReplayChances,
} from "@/lib/analyzer/plays";
import type { ReplayData } from "@/lib/analyzer/replay";
import { stretchAt, type TempoTimeline } from "@/lib/analyzer/tempo";
import type { ReplayRequest } from "./review-links";

// The grade's pill: filled for Great and Mistake, outlined for Good and
// Inaccuracy, grey for Even. Blue when the chance went up, red when down.
export const GRADE_CHIP: Record<Grade, string> = {
  Great: "border-ahead bg-ahead text-page",
  Good: "border-ahead text-ahead-soft",
  Even: "border-line-strong text-muted",
  Inaccuracy: "border-behind text-behind",
  Mistake: "border-behind bg-behind text-page",
};

// The play's mark on the timeline: bigger the more it moved the chance.
const GRADE_MARK: Record<Grade, string> = {
  Great: "size-2.5 bg-ahead",
  Good: "size-[7px] bg-ahead",
  Even: "size-[5px] bg-faint",
  Inaccuracy: "size-[7px] bg-behind",
  Mistake: "size-2.5 bg-behind",
};

const GRADES: Grade[] = ["Great", "Good", "Even", "Inaccuracy", "Mistake"];

// Your team's chance to win at the timeline's top: blue above even, red
// below. One point per second, so kills show as steps.
export function ChanceRow({ perSecond }: { perSecond: number[] }) {
  const last = perSecond.length - 1;
  if (last < 1) return <div className="h-14" />;
  // perSecond is in tenths of a percent: 1000 at the top, 0 at the bottom.
  const y = (v: number) => (1000 - v) / 10;
  const line = perSecond.map((v, s) => `${s} ${y(v)}`).join(" L");
  const area = (pick: (v: number) => number) =>
    `M0 50 L${perSecond.map((v, s) => `${s} ${y(pick(v))}`).join(" L")} L${last} 50 Z`;
  return (
    <div aria-hidden="true" className="relative h-14">
      <svg
        viewBox={`0 0 ${last} 100`}
        preserveAspectRatio="none"
        className="absolute inset-0 size-full overflow-visible"
      >
        <path d={area((v) => Math.max(v, 500))} className="fill-ahead opacity-25" />
        <path d={area((v) => Math.min(v, 500))} className="fill-behind opacity-25" />
        <path
          d={`M0 50 H${last}`}
          className="stroke-faint"
          strokeWidth={1}
          strokeDasharray="3 4"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={`M${line}`}
          fill="none"
          className="stroke-ink-soft"
          strokeWidth={1.5}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}

// A dot at each play, in its grade's color: round for fights, square when
// it took an objective.
export function PlayMarks({ plays, left }: { plays: Play[]; left: (ms: number) => string }) {
  return (
    <div aria-hidden="true" className="relative h-6">
      {plays.map((play) => (
        <span
          key={play.from}
          className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 ${GRADE_MARK[gradeOf(playSwing(play))]} ${
            play.objectives.length > 0 ? "rounded-[2px]" : "rounded-full"
          }`}
          style={{ left: left(play.from) }}
        />
      ))}
    </div>
  );
}

export function ReplayPlays({
  chances,
  replay,
  names,
  t,
  onPick,
  request,
  tempo,
  them,
}: {
  chances: ReplayChances;
  replay: ReplayData;
  // Champion display name for each participantId.
  names: Record<number, string>;
  t: number;
  // Moves the replay's clock to a moment (ms).
  onPick: (ms: number) => void;
  // The latest "Watch in replay" from the 60-second review, whose play opens
  // here.
  request: ReplayRequest | null;
  // Null unless you played jungle.
  tempo: TempoTimeline | null;
  // The enemy jungler's champion.
  them: string;
}) {
  const [yoursOnly, setYoursOnly] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const { plays } = chances;
  const [seenRequest, setSeenRequest] = useState(request);
  if (request !== seenRequest) {
    setSeenRequest(request);
    const index = request ? plays.findIndex((play) => playStart(play) === request.ms) : -1;
    if (index >= 0) {
      setOpen(index);
      if (!plays[index].mine) setYoursOnly(false);
    }
  }
  const shown = plays.filter((play) => !yoursOnly || play.mine);
  // The play the replay is on or just past.
  const current = shown.findLast((play) => playStart(play) <= t);

  const counts = GRADES.flatMap((grade) => {
    const n = plays.filter((play) => play.mine && gradeOf(playSwing(play)) === grade).length;
    return n > 0 ? [`${n} ${grade}`] : [];
  });
  const yours = plays.filter((play) => play.mine).length;

  return (
    <section aria-labelledby="plays-heading" className="flex flex-col gap-4 border-t border-line pt-5">
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h3
            id="plays-heading"
            className="font-display text-[22px] font-bold uppercase leading-tight tracking-[0.01em]"
          >
            Plays
          </h3>
          <div
            role="group"
            aria-label="Which plays"
            className="inline-flex overflow-hidden rounded-lg border border-line-strong text-note"
          >
            {[false, true].map((mineOnly) => (
              <button
                key={String(mineOnly)}
                type="button"
                aria-pressed={yoursOnly === mineOnly}
                onClick={() => setYoursOnly(mineOnly)}
                className={`px-3 py-1.5 ${
                  yoursOnly === mineOnly ? "bg-line-strong text-ink" : "text-muted hover:text-ink"
                }`}
              >
                {mineOnly ? "Yours" : "All"}
              </button>
            ))}
          </div>
        </div>
        <p className="text-sm text-muted">
          Every fight, epic monster and building, graded by how much it changed your team&apos;s
          chance to win: Great from +4 points, Good from +1, Inaccuracy from −1 and Mistake from −4.
          It shows what a play did to the game, not whether it was the right call.
        </p>
        <p className="text-sm text-ink-soft">
          {yours === 0
            ? "You weren't in any of them."
            : `Your ${yours === 1 ? "play" : `${yours} plays`}: ${listNames(counts)}.`}
        </p>
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-muted">No plays to show.</p>
      ) : (
        <ol className="flex max-h-[28rem] flex-col gap-1 overflow-y-auto pr-1">
          {shown.map((play) => {
            const index = plays.indexOf(play);
            const swing = playSwing(play);
            const grade = gradeOf(swing);
            const isOpen = open === index;
            const tone =
              tempo && stretchAt(tempo.stretches, play.from - 1)?.tone;
            return (
              <li
                key={play.from}
                className={`rounded-[10px] border ${
                  play === current ? "border-line-strong" : "border-transparent"
                } ${isOpen ? "bg-surface-hover" : ""}`}
              >
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={`play-${index}`}
                  onClick={() => {
                    setOpen(isOpen ? null : index);
                    onPick(playStart(play));
                  }}
                  className="grid min-h-11 w-full grid-cols-[2.75rem_1.125rem_minmax(0,1fr)] items-start gap-2 rounded-[10px] px-2.5 py-2 text-left"
                >
                  <span className="pt-0.5 font-mono text-note text-faint">{formatClock(play.from)}</span>
                  <span className="pt-0.5">
                    <PlayIcon play={play} replay={replay} grade={grade} />
                  </span>
                  {/* The grade sits at the end of the row, or under the
                      title when there isn't room beside it. */}
                  <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <span className="text-sm text-ink">
                      {playTitle(play, replay, names)}
                      {play.mine && (
                        <span className="ml-1.5 inline-block rounded-[4px] border border-ahead px-1 align-[1px] font-mono text-[10px] uppercase leading-normal tracking-[0.08em] text-ahead-soft">
                          You
                        </span>
                      )}
                    </span>
                    <span
                      className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-note font-semibold ${GRADE_CHIP[grade]}`}
                    >
                      {grade} {formatSwing(swing)}
                    </span>
                  </span>
                </button>
                {isOpen && (
                  <div id={`play-${index}`} className="flex flex-col gap-1.5 pb-3 pl-[4.25rem] pr-3 text-sm text-muted">
                    <ul className="flex flex-col gap-1">
                      {playLines(play, replay, names).map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                    </ul>
                    <p className="text-ink-soft">
                      Your team&apos;s chance to win went from {percent(play.before)} to{" "}
                      {percent(play.after)}.
                    </p>
                    {tone && (
                      <p>
                        {tone === "ahead"
                          ? "You were up tempo just before it."
                          : tone === "behind"
                            ? `${them} was up tempo just before it.`
                            : "Tempo was even just before it."}
                      </p>
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

// 0.5234 -> "52.3%".
function percent(chance: number): string {
  return `${(chance * 100).toFixed(1)}%`;
}

// What kind of play it was, by its biggest objective, or a fight: crossed
// swords, a dragon's flame, three grubs, the Herald's eye, a tower, an
// inhibitor's crystal, or a dot for Baron, Elder and Atakhan.
function PlayIcon({ play, replay, grade }: { play: Play; replay: ReplayData; grade: Grade }) {
  const kinds = play.objectives.map((i) => replay.objectives[i].kind);
  const kind = (["inhibitor", "dragon", "herald", "grubs", "tower"] as const).find((k) =>
    kinds.includes(k),
  );
  const big = kinds.some((k) => k === "baron" || k === "elder" || k === "atakhan");
  const color =
    grade === "Great" || grade === "Good"
      ? "text-ahead-soft"
      : grade === "Even"
        ? "text-faint"
        : "text-behind";
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
      className={color}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {big ? (
        <circle cx="8" cy="8" r="3.5" fill="currentColor" stroke="none" />
      ) : kind === "dragon" ? (
        <path d="M8 1.8 C10.2 4.6 13 6.8 13 10 A5 5 0 0 1 3 10 C3 6.8 5.8 4.6 8 1.8 Z" />
      ) : kind === "grubs" ? (
        <>
          <circle cx="4" cy="10.5" r="2.2" />
          <circle cx="8" cy="5.5" r="2.2" />
          <circle cx="12" cy="10.5" r="2.2" />
        </>
      ) : kind === "herald" ? (
        <>
          <path d="M1.5 8 C4 3.6 12 3.6 14.5 8 C12 12.4 4 12.4 1.5 8 Z" />
          <circle cx="8" cy="8" r="2" />
        </>
      ) : kind === "tower" ? (
        <path d="M5 14 V6.5 H11 V14 M4 6.5 V2.5 H6 V4 H7.2 V2.5 H8.8 V4 H10 V2.5 H12 V6.5 M3 14 H13" />
      ) : kind === "inhibitor" ? (
        <path d="M8 1.8 L13 8 L8 14.2 L3 8 Z" />
      ) : (
        <path d="M3 3 L13 13 M13 3 L3 13 M2.5 10 L6 13.5 M10 13.5 L13.5 10" />
      )}
    </svg>
  );
}
