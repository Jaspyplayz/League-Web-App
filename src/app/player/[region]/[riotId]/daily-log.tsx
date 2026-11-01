"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { saveDayNoteAction } from "@/app/account/actions";
import { hoverFade, iconButton } from "@/components/header-style";
import { panelClass } from "@/components/ui/panel";
import {
  EmptyPanel,
  mainButtonClass,
  ProblemPanel,
  secondButtonClass,
} from "@/components/ui/state-panel";
import {
  daysAgo,
  focusResults,
  formatDay,
  formatMonth,
  groupDays,
  lastFourWeeks,
  LOG_DAYS,
  monthGrid,
  monthName,
  monthOf,
  monthsInRange,
  startMonth,
  type CalendarDay,
  type DayColour,
  type LogDay,
  type LogGame,
  type LogRankPoint,
} from "@/lib/daily-log";
import { FOCUS_GOALS, type Focus } from "@/lib/focus";
import { MAX_NOTE_LENGTH, type ReadDayNotesResult, type SaveNoteResult } from "@/lib/match-note";
import { useFocus } from "./insights/focus";

// The By day view's content, under Matches: a month calendar coloured by how
// each day went, beside a column with one panel per day (JAS-112). On a phone
// the calendar sits above the panels. It runs in the browser because days
// depend on the viewer's timezone, and the focus goal is saved in this
// browser (localStorage).

type Props = {
  games: LogGame[];
  ranks: LogRankPoint[];
  // The signed-in player's notes by day, or null when this isn't their
  // profile (then no notes or note boxes show).
  notes: ReadDayNotesResult | null;
  player: string; // playerKey(), for the focus goal
  playerPath: string;
};

export function DailyLog({ games, ranks, notes, player, playerPath }: Props) {
  // The server can't know the viewer's timezone, so it renders a short
  // placeholder and the browser draws the days right after the page loads.
  const inBrowser = useSyncExternalStore(
    noChanges,
    () => true,
    () => false,
  );
  // React's lint rule warns that reading the clock gives different output
  // each render; "today" is exactly what the calendar and labels need.
  // eslint-disable-next-line react-hooks/purity
  const now = useMemo(() => Date.now(), []);
  const days = useMemo(() => groupDays(games, ranks), [games, ranks]);

  if (!inBrowser) return <p className="text-quiet">Loading your days…</p>;
  return <ByDayView days={days} now={now} notes={notes} player={player} playerPath={playerPath} />;
}

function noChanges() {
  return () => {};
}

// The calendar and the day panels for days already grouped in the viewer's
// timezone. Exported for its tests, which pass a fixed "now".
export function ByDayView({
  days: fetched,
  now,
  notes,
  player,
  playerPath,
}: {
  days: LogDay[];
  now: number;
  notes: ReadDayNotesResult | null;
  player: string;
  playerPath: string;
}) {
  const focus = useFocus(player);
  const days = lastFourWeeks(fetched, now);
  // The month the player moved to with the arrows; until then, the month of
  // the newest game.
  const [picked, setPicked] = useState<string | null>(null);

  const month = picked ?? startMonth(days, now);
  const months = monthsInRange(now);
  const index = months.indexOf(month);
  const shown = days.filter((d) => monthOf(d.day) === month);

  return (
    <>
      <div className="grid items-start gap-3.5 lg:grid-cols-[340px_minmax(0,1fr)] lg:gap-6">
        <Calendar
          month={month}
          days={days}
          now={now}
          previous={index > 0 ? () => setPicked(months[index - 1]) : null}
          next={index >= 0 && index < months.length - 1 ? () => setPicked(months[index + 1]) : null}
        />
        <div className="flex min-w-0 flex-col gap-3.5">
          {notes?.ok === false && (
            // Once, above the days; each day panel also says so where its
            // note box would be.
            <ProblemPanel title="Your notes couldn't be loaded">
              Reload the page to try again.
            </ProblemPanel>
          )}
          {days.length === 0 ? (
            // No games at all: no "Days" heading, just what will fill the calendar.
            <EmptyPanel title={`No games in the last ${LOG_DAYS / 7} weeks`}>
              {FILL_HINT}
            </EmptyPanel>
          ) : (
            <>
              <DaysHeading days={shown} />
              {shown.length === 0 ? (
                <EmptyPanel title={`No games in ${monthName(month)}`}>{FILL_HINT}</EmptyPanel>
              ) : (
                <ol className="flex flex-col gap-3.5">
                  {shown.map((day) => (
                    <li key={day.day}>
                      <DayPanel
                        day={day}
                        now={now}
                        focus={focus}
                        note={notes?.ok ? (notes.byDay[day.day] ?? "") : null}
                        notesFailed={notes?.ok === false}
                        playerPath={playerPath}
                      />
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </div>
      </div>
      <p className="text-note text-quiet">
        Wins, losses and game scores come from your Riot match history, for the last{" "}
        {LOG_DAYS / 7} weeks. LP comes from the rank Turnpoint saves each time this profile
        updates, so a day with no update in between says &ldquo;LP not recorded&rdquo;. Remakes
        are left out.
      </p>
    </>
  );
}

const FILL_HINT =
  "Days you play fill in on the calendar, blue when you won most games and red when you lost most. Pick one to see its games.";

// The heading over the day panels, with the shown month's totals beside it.
function DaysHeading({ days }: { days: LogDay[] }) {
  const wins = days.reduce((sum, d) => sum + d.wins, 0);
  const losses = days.reduce((sum, d) => sum + d.losses, 0);
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 className="text-note font-medium text-quiet">Days</h2>
      {days.length > 0 && (
        <p className="text-note text-quiet tabular-nums">
          {days.length} {days.length === 1 ? "day" : "days"} played · {wins}W {losses}L
        </p>
      )}
    </div>
  );
}

// ---- The calendar ----

// Each day's fill. The blue and red (32% and 30%, or 22% and 20% in the
// light theme) are the gold chart's area tokens, and the day number stays in the
// text colour on them so it's easy to read. A tie gets the divider grey, so it
// reads as a day played that went neither way.
const DAY_FILL: Record<DayColour, string> = {
  won: "bg-ahead-fill font-semibold text-main",
  lost: "bg-behind-fill font-semibold text-main",
  even: "bg-divider font-semibold text-main",
  none: "bg-raised text-quiet",
};

// Tailwind only builds classes it finds written out in full, so the seven
// starting columns are listed rather than built from the number.
const START_COLUMN = [
  "col-start-1",
  "col-start-2",
  "col-start-3",
  "col-start-4",
  "col-start-5",
  "col-start-6",
  "col-start-7",
];

const WEEKDAYS = [
  ["M", "Mon"],
  ["T", "Tue"],
  ["W", "Wed"],
  ["T", "Thu"],
  ["F", "Fri"],
  ["S", "Sat"],
  ["S", "Sun"],
];

function Calendar({
  month,
  days,
  now,
  previous,
  next,
}: {
  month: string; // "2026-10"
  days: LogDay[];
  now: number;
  previous: (() => void) | null; // null when the four weeks don't reach that month
  next: (() => void) | null;
}) {
  const grid = monthGrid(month, days, now);
  return (
    // On wide screens the calendar stays in view while the day column scrolls.
    <section className={`${panelClass} p-4 lg:sticky lg:top-24`} aria-labelledby="by-day-month">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 id="by-day-month" className="text-subheading font-semibold">
          {formatMonth(month)}
        </h2>
        <div className="flex gap-1">
          <MonthButton label="Previous month" onClick={previous} path="M15 6l-6 6 6 6" />
          <MonthButton label="Next month" onClick={next} path="M9 6l6 6-6 6" />
        </div>
      </div>
      {/* The weekday names are for sighted readers; each day says its own
          weekday to a screen reader. */}
      <div aria-hidden="true" className="mb-1 grid grid-cols-7 gap-1.5 text-center text-xs text-quiet">
        {WEEKDAYS.map(([short, long]) => (
          <span key={long}>
            <span className="sm:hidden">{short}</span>
            <span className="hidden sm:inline">{long}</span>
          </span>
        ))}
      </div>
      <ol className="grid grid-cols-7 gap-1.5">
        {grid.map((d) => (
          <li key={d.day} className={d.date === 1 ? START_COLUMN[d.weekday] : undefined}>
            <CalendarCell day={d} />
          </li>
        ))}
      </ol>
      <ul className="mt-3 flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-quiet">
        <Legend className={DAY_FILL.won}>Won most games</Legend>
        <Legend className={DAY_FILL.lost}>Lost most games</Legend>
        <Legend className={DAY_FILL.even}>Even</Legend>
        <Legend className={DAY_FILL.none}>No games</Legend>
      </ul>
    </section>
  );
}

function CalendarCell({ day }: { day: CalendarDay }) {
  const shape = `flex h-10 items-center justify-center rounded-md text-note tabular-nums ${
    day.today ? "ring-2 ring-inset ring-main" : ""
  }`;
  const date = formatDay(day.day);
  // Outside the four weeks By day has no games to show, so the day gets no
  // fill rather than looking like a day with no games.
  if (!day.inRange) {
    return (
      <span className={`${shape} text-quiet`}>
        <span aria-hidden="true">{day.date}</span>
        <span className="sr-only">{date}{day.today ? ", today" : ""}</span>
      </span>
    );
  }
  const record = day.colour === "none" ? "no games" : `${day.wins}W ${day.losses}L`;
  const words = `${date}${day.today ? ", today" : ""}: ${record}`;
  if (day.colour === "none") {
    return (
      <span className={`${shape} ${DAY_FILL.none}`}>
        <span aria-hidden="true">{day.date}</span>
        <span className="sr-only">{words}</span>
      </span>
    );
  }
  // A day with games jumps to its panel.
  return (
    <a
      href={`#${dayAnchor(day.day)}`}
      className={`${shape} ${DAY_FILL[day.colour]} transition-shadow hover:ring-2 hover:ring-inset hover:ring-main`}
    >
      <span aria-hidden="true">{day.date}</span>
      <span className="sr-only">{words}</span>
    </a>
  );
}

function MonthButton({
  label,
  onClick,
  path,
}: {
  label: string;
  onClick: (() => void) | null;
  path: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick ?? undefined}
      disabled={!onClick}
      className={`${iconButton} disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-quiet`}
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
        <path d={path} />
      </svg>
    </button>
  );
}

function Legend({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-1.5">
      <span aria-hidden="true" className={`inline-block size-3 rounded-sm ${className}`} />
      {children}
    </li>
  );
}

function dayAnchor(day: string): string {
  return `day-${day}`;
}

// ---- The day panels ----

function LpText({ lp }: { lp: number }) {
  if (lp === 0) return <span className="text-quiet">LP even</span>;
  return lp > 0 ? (
    <span className="text-ahead">{lp} LP gained</span>
  ) : (
    <span className="text-behind">{-lp} LP lost</span>
  );
}

function DayPanel({
  day,
  now,
  focus,
  note,
  notesFailed,
  playerPath,
}: {
  day: LogDay;
  now: number;
  focus: Focus | null;
  // The saved note ("" for none), or null when there's no note box: this
  // isn't the player's own profile, or their notes couldn't be read.
  note: string | null;
  notesFailed: boolean;
  playerPath: string;
}) {
  const focused = focus ? focusResults(day.games, focus) : [];
  const titleId = `${dayAnchor(day.day)}-title`;

  return (
    // scroll-mt keeps the panel clear of the sticky header when a calendar
    // day jumps to it.
    <article
      id={dayAnchor(day.day)}
      aria-labelledby={titleId}
      className={`${panelClass} flex scroll-mt-24 flex-col gap-2.5 p-4`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id={titleId} className="text-heading font-semibold leading-tight">
            {formatDay(day.day)}
          </h3>
          <p className="text-note text-quiet">{daysAgo(day.day, now)}</p>
        </div>
        <div className="flex flex-col items-end text-right tabular-nums">
          <p>
            <b className="font-semibold">
              {day.wins}W {day.losses}L
            </b>{" "}
            <span className="text-quiet">
              · {day.games.length} {day.games.length === 1 ? "game" : "games"}
            </span>
          </p>
          <p className="text-note">
            {day.lp !== null ? (
              <LpText lp={day.lp} />
            ) : (
              day.ranked > 0 && <span className="text-quiet">LP not recorded</span>
            )}
          </p>
        </div>
      </div>

      {focus && focused.length > 0 && <FocusLine goal={FOCUS_GOALS[focus.id]} results={focused} />}

      <GameList games={day.games} playerPath={playerPath} />

      {notesFailed ? (
        <p className="text-note text-quiet">Your note for this day couldn&apos;t be loaded.</p>
      ) : (
        note !== null && <DayNote day={day.day} savedText={note} />
      )}
    </article>
  );
}

function FocusLine({ goal, results }: { goal: string; results: (boolean | null)[] }) {
  const counted = results.filter((r) => r !== null);
  return (
    <p className="flex flex-wrap items-center gap-2 text-note text-quiet">
      <span>Focus: {goal}</span>
      <span className="inline-flex gap-1" aria-hidden>
        {results.map((r, i) => (
          <span
            key={i}
            className={`inline-block size-2 rounded-full ${
              r === null ? "border border-divider" : r ? "bg-ahead" : "bg-behind"
            }`}
          />
        ))}
      </span>
      {counted.length > 0 && (
        <span className="tabular-nums">
          managed in {counted.filter(Boolean).length} of {counted.length}
        </span>
      )}
    </p>
  );
}

// The day's games, newest first, each one compact link to its match page:
// W or L, the champion, K / D / A and the game score. A game with an AI
// recap shows its one-line headline under the row.
function GameList({ games, playerPath }: { games: LogGame[]; playerPath: string }) {
  return (
    <ul className="-mx-2 flex flex-col gap-0.5">
      {games.map((g) => {
        const kda = `${g.kills} / ${g.deaths} / ${g.assists}`;
        return (
          <li key={g.matchId}>
            {/* The link's name is its own text, with a few words only a
                screen reader hears: "Win, Galio, 7 / 4 / 6, score 51". */}
            <Link
              href={`${playerPath}/match/${g.matchId}`}
              className={`grid grid-cols-[1rem_1.75rem_minmax(0,1fr)_auto_2.25rem] items-center gap-2.5 rounded-md px-2 py-1.5 text-body tabular-nums ${hoverFade}`}
            >
              <b className={`font-semibold ${g.win ? "text-ahead" : "text-behind"}`}>
                <span aria-hidden="true">{g.win ? "W" : "L"}</span>
                <span className="sr-only">{g.win ? "Win," : "Loss,"}</span>
              </b>
              {g.championIcon ? (
                <Image
                  src={g.championIcon}
                  alt=""
                  width={28}
                  height={28}
                  unoptimized
                  className="size-7 rounded-md bg-raised"
                />
              ) : (
                <span className="size-7 rounded-md bg-raised" />
              )}
              <span className="truncate">
                {g.championLabel}
                <span className="sr-only">,</span>
              </span>
              <span className="text-quiet">{kda}</span>
              <span
                title={g.score !== null ? "Game score, 0 to 100" : "No game score in this mode"}
                className="rounded-sm bg-raised py-0.5 text-center text-note"
              >
                {g.score !== null ? (
                  <>
                    <span className="sr-only">, score </span>
                    {g.score}
                  </>
                ) : (
                  <>
                    <span aria-hidden="true">–</span>
                    <span className="sr-only">, no score</span>
                  </>
                )}
              </span>
            </Link>
            {g.recap && <p className="pb-1 pl-17 pr-2 text-note text-quiet">{g.recap}</p>}
          </li>
        );
      })}
    </ul>
  );
}

// The private note on a day: a text box that's always open, with Save and
// Cancel once something has changed. How notes are saved is unchanged.
function DayNote({ day, savedText }: { day: string; savedText: string }) {
  const [saved, setSaved] = useState(savedText);
  const [text, setText] = useState(savedText);
  const [result, setResult] = useState<SaveNoteResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const id = `day-note-${day}`;
  const changed = text.trim() !== saved;

  function save(event: React.FormEvent) {
    event.preventDefault();
    const sent = text;
    startTransition(async () => {
      try {
        const next = await saveDayNoteAction(day, sent);
        setResult(next);
        if (next.status === "saved") setSaved(sent.trim());
      } catch {
        // Usually a new version of the site went live since this page loaded.
        setResult({ status: "failed", message: "Couldn't save. Reload the page and try again." });
      }
    });
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-note text-quiet">
        Your note for this day
      </label>
      <textarea
        id={id}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setResult(null);
        }}
        maxLength={MAX_NOTE_LENGTH}
        rows={2}
        placeholder="What went well, and what to try next time"
        aria-describedby={`${id}-hint`}
        className="w-full resize-y rounded-md bg-raised px-3 py-2.5 text-body text-main placeholder:text-quiet"
      />
      <div className="flex flex-wrap items-center gap-3 text-note">
        {changed && (
          <>
            <button type="submit" disabled={isPending} className={mainButtonClass}>
              {isPending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => {
                setText(saved);
                setResult(null);
              }}
              className={secondButtonClass}
            >
              Cancel
            </button>
          </>
        )}
        <p id={`${id}-hint`} role="status" className="text-quiet">
          {result?.status === "failed"
            ? result.message
            : result?.status === "saved" && !changed
              ? "Saved. Only you can see this."
              : "Only you can see this."}
        </p>
      </div>
    </form>
  );
}
