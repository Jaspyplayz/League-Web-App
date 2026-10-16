"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { saveDayNoteAction } from "@/app/account/actions";
import { Gap } from "@/components/ui/gap";
import { panelClass } from "@/components/ui/panel";
import {
  dayStats,
  daysAgo,
  focusResults,
  groupDays,
  LOG_DAYS,
  monthStrip,
  type LogDay,
  type LogGame,
  type LogRankPoint,
  type StripDay,
} from "@/lib/daily-log";
import { FOCUS_GOALS, type Focus } from "@/lib/focus";
import { MAX_NOTE_LENGTH, type SaveNoteResult } from "@/lib/match-note";
import { useFocus } from "../insights/focus";

// The Log tab's content. It runs in the browser because days depend on the
// viewer's timezone, and because the Short / Detailed choice and the focus
// goal are saved in this browser (localStorage).

type Props = {
  games: LogGame[];
  ranks: LogRankPoint[];
  // The signed-in player's notes by day, or null when this isn't their
  // profile (then no notes or note boxes show).
  notes: Record<string, string> | null;
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
  const view = useView();
  const focus = useFocus(player);
  // React's lint rule warns that reading the clock gives different output
  // each render; "today" is exactly what the strip and labels need.
  // eslint-disable-next-line react-hooks/purity
  const now = useMemo(() => Date.now(), []);
  const days = useMemo(() => groupDays(games, ranks), [games, ranks]);

  if (!inBrowser) return <p className="text-muted">Loading your days…</p>;
  if (days.length === 0) {
    return (
      <p className={`${panelClass} px-5 py-4 text-muted`}>
        No games in the last {LOG_DAYS / 7} weeks. Days you play show up here, one card each.
      </p>
    );
  }

  return (
    <>
      <MonthSummary days={days} now={now} focus={focus} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-label font-medium uppercase tracking-[0.12em] text-faint">Days</h2>
        <ViewSwitch view={view} />
      </div>
      <ol className="flex flex-col gap-2.5">
        {days.map((day) => (
          <li key={day.day}>
            <DayCard
              day={day}
              now={now}
              detailed={view === "detailed"}
              focus={focus}
              note={notes ? (notes[day.day] ?? "") : null}
              playerPath={playerPath}
            />
          </li>
        ))}
      </ol>
      <p className="text-note text-faint">
        Wins, losses and game scores come from your Riot match history. LP comes from the rank
        Turnpoint saves each time this profile updates, so a day with no update in between
        says &ldquo;LP not recorded&rdquo;. Remakes are left out.
      </p>
    </>
  );
}

function noChanges() {
  return () => {};
}

// Four weeks at a glance: one square per day, blue when you won most of that
// day's games and red when you lost most, brighter on busier days.
function MonthSummary({ days, now, focus }: { days: LogDay[]; now: number; focus: Focus | null }) {
  const strip = monthStrip(days, now);
  const wins = days.reduce((sum, d) => sum + d.wins, 0);
  const losses = days.reduce((sum, d) => sum + d.losses, 0);
  const lp = days.filter((d) => d.lp !== null);
  const lpTotal = lp.reduce((sum, d) => sum + (d.lp ?? 0), 0);
  const focused = focus ? days.flatMap((d) => focusResults(d.games, focus)) : [];
  const counted = focused.filter((r) => r !== null);

  return (
    <section className={`${panelClass} flex flex-col gap-3 p-5`} aria-labelledby="log-month">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <p className="text-label font-medium uppercase tracking-[0.12em] text-faint">
            Last {LOG_DAYS / 7} weeks
          </p>
          <h2 id="log-month" className="font-display text-[26px] font-semibold leading-tight">
            {days.length} {days.length === 1 ? "day" : "days"} played
          </h2>
        </div>
        <p className="text-note text-muted tabular-nums">
          {wins + losses} games · {wins}W {losses}L
          {lp.length > 0 && (
            <>
              {" · "}
              <LpText lp={lpTotal} />
            </>
          )}
          {counted.length > 0 &&
            ` · Focus goal managed in ${counted.filter(Boolean).length} of ${counted.length}`}
        </p>
      </div>
      <ol
        aria-label="One square per day, oldest first"
        className="grid grid-cols-[repeat(14,minmax(0,1fr))] gap-1 sm:grid-cols-[repeat(28,minmax(0,1fr))]"
      >
        {strip.map((d) => (
          <li
            key={d.day}
            title={stripLabel(d)}
            aria-label={stripLabel(d)}
            className={`aspect-square rounded-[3px] ${stripColor(d)} ${
              d === strip.at(-1) ? "outline outline-1 outline-offset-1 outline-ink" : ""
            }`}
          />
        ))}
      </ol>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-faint">
        <Legend className="bg-ahead">Won most games</Legend>
        <Legend className="bg-behind">Lost most games</Legend>
        <Legend className="bg-faint">Even</Legend>
        <Legend className="bg-line">No games</Legend>
        <li>Brighter = 4 or more games</li>
      </ul>
    </section>
  );
}

function Legend({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-1.5">
      <span className={`inline-block h-2.5 w-2.5 rounded-[2px] ${className}`} />
      {children}
    </li>
  );
}

function stripColor({ games, wins, losses }: StripDay): string {
  if (games === 0) return "bg-line";
  const busy = games >= 4;
  if (wins > losses) return busy ? "bg-ahead" : "bg-ahead/60";
  if (losses > wins) return busy ? "bg-behind" : "bg-behind/60";
  return "bg-faint";
}

function stripLabel({ day, games, wins, losses }: StripDay): string {
  const date = formatDay(day);
  return games === 0 ? `${date}: no games` : `${date}: ${wins}W ${losses}L`;
}

// "Thu, Oct 16" from "2026-10-16". Built at noon so no timezone can move it.
function formatDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d, 12).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function LpText({ lp }: { lp: number }) {
  if (lp === 0) return <span className="text-muted">LP even</span>;
  return lp > 0 ? (
    <span className="text-ahead">{lp} LP gained</span>
  ) : (
    <span className="text-behind">{-lp} LP lost</span>
  );
}

// Short or Detailed day cards, the player's own choice, remembered in this
// browser like the theme.
const VIEW_KEY = "turnpoint:log-view";
type View = "short" | "detailed";
const viewListeners = new Set<() => void>();

function useView(): View {
  const saved = useSyncExternalStore(
    (onChange) => {
      viewListeners.add(onChange);
      return () => viewListeners.delete(onChange);
    },
    readView,
    () => "short" as const,
  );
  return saved;
}

function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === "detailed" ? "detailed" : "short";
  } catch {
    return "short";
  }
}

function saveView(view: View) {
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch {
    // Not remembered next time; the switch still works for this visit.
  }
  viewListeners.forEach((onChange) => onChange());
}

function ViewSwitch({ view }: { view: View }) {
  return (
    <div
      role="group"
      aria-label="Card size"
      className="inline-flex overflow-hidden rounded-lg border border-line-strong text-note"
    >
      {(["short", "detailed"] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={view === option}
          onClick={() => saveView(option)}
          className={`px-3.5 py-1.5 capitalize ${
            view === option ? "bg-line-strong text-ink" : "text-muted hover:text-ink"
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

function DayCard({
  day,
  now,
  detailed,
  focus,
  note,
  playerPath,
}: {
  day: LogDay;
  now: number;
  detailed: boolean;
  focus: Focus | null;
  note: string | null;
  playerPath: string;
}) {
  const stats = dayStats(day.games);
  const focused = focus ? focusResults(day.games, focus) : [];

  return (
    <article className={`${panelClass} flex flex-col gap-3 p-4 sm:flex-row sm:gap-5`}>
      <div className="shrink-0 sm:w-28">
        <h3 className="font-display text-[22px] font-semibold leading-tight">
          {formatDay(day.day)}
        </h3>
        <p className="text-xs text-faint">{daysAgo(day.day, now)}</p>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-ink-soft tabular-nums">
          <span>
            <b className="font-semibold text-ink">
              {day.wins}W {day.losses}L
            </b>{" "}
            · {day.games.length} {day.games.length === 1 ? "game" : "games"}
          </span>
          {day.lp !== null ? (
            <LpText lp={day.lp} />
          ) : (
            day.ranked > 0 && <span className="text-faint">LP not recorded</span>
          )}
          {stats.score !== null && <span>Score {Math.round(stats.score)} avg</span>}
        </p>

        {focus && focused.length > 0 && (
          <FocusLine goal={FOCUS_GOALS[focus.id]} results={focused} />
        )}

        {detailed && (
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-note text-muted tabular-nums">
            <span>
              Champions{" "}
              <b className="font-medium text-ink">
                {stats.champions
                  .map((c) => (c.games > 1 ? `${c.label} ×${c.games}` : c.label))
                  .join(", ")}
              </b>
            </span>
            <span>
              CS/min <b className="font-medium text-ink">{stats.csPerMin.toFixed(1)}</b>
            </span>
            <span>
              Deaths <b className="font-medium text-ink">{stats.deaths.toFixed(1)}</b> avg
            </span>
            <span>
              Vision/min <b className="font-medium text-ink">{stats.visionPerMin.toFixed(1)}</b>
            </span>
            {stats.goldAt15 !== null && (
              <span>
                Gold at 15 <Gap you={stats.goldAt15} them={0} /> avg
              </span>
            )}
          </p>
        )}

        <GameList games={day.games} open={detailed} playerPath={playerPath} />

        {note !== null && <DayNote day={day.day} savedText={note} />}
      </div>
    </article>
  );
}

function FocusLine({ goal, results }: { goal: string; results: (boolean | null)[] }) {
  const counted = results.filter((r) => r !== null);
  return (
    <p className="flex flex-wrap items-center gap-2 text-note text-muted">
      <span>Focus: {goal}</span>
      <span className="inline-flex gap-1" aria-hidden>
        {results.map((r, i) => (
          <span
            key={i}
            className={`inline-block h-2 w-2 rounded-full ${
              r === null ? "border border-line-strong" : r ? "bg-ahead" : "bg-behind"
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

// The day's games, oldest at the bottom, each linking to its analysis. Folded
// away on Short cards. Each game is its own row with room for a second line
// under it, for a one-line recap of the game once those exist.
function GameList({
  games,
  open,
  playerPath,
}: {
  games: LogGame[];
  open: boolean;
  playerPath: string;
}) {
  const best = games.reduce<LogGame | null>(
    (top, g) => (g.score !== null && (top?.score ?? -1) < g.score ? g : top),
    null,
  );
  const rows = (
    <ul className="flex flex-col divide-y divide-line">
      {games.map((g) => (
        <li key={g.matchId} className="flex flex-col py-1.5">
          <div className="flex items-center gap-3 text-note text-ink-soft tabular-nums">
            <span
              className={`h-2 w-2 shrink-0 rounded-[2px] ${g.win ? "bg-ahead" : "bg-behind"}`}
              aria-label={g.win ? "Win" : "Loss"}
            />
            <span className="min-w-0 flex-1 truncate">{g.championLabel}</span>
            <span className="font-mono text-xs">
              {g.kills}/{g.deaths}/{g.assists}
            </span>
            {g.score !== null && (
              <span className="hidden whitespace-nowrap font-mono text-xs text-muted sm:inline">
                Score {g.score}
                {g === best && games.length > 1 && <span className="text-ahead"> · best</span>}
              </span>
            )}
            <Link
              href={`${playerPath}/match/${g.matchId}`}
              className="font-medium text-ahead-soft hover:underline"
            >
              Analyze
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );

  if (open) return rows;
  return (
    <details className="group">
      <summary className="cursor-pointer text-note text-faint hover:text-ink">
        <span className="group-open:hidden">Show games</span>
        <span className="hidden group-open:inline">Hide games</span>
      </summary>
      {rows}
    </details>
  );
}

// The private note on a day. Shows the saved note with an Edit button, or an
// "Add a note" button, and opens a small text box to write it.
function DayNote({ day, savedText }: { day: string; savedText: string }) {
  const [saved, setSaved] = useState(savedText);
  const [text, setText] = useState(savedText);
  const [editing, setEditing] = useState(false);
  const [result, setResult] = useState<SaveNoteResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const id = `day-note-${day}`;

  if (!editing) {
    return (
      <div className="flex items-start justify-between gap-3 rounded-lg border border-line bg-page px-3 py-2 text-note">
        {saved ? (
          <p className="min-w-0 whitespace-pre-line text-ink">{saved}</p>
        ) : (
          <p className="text-faint">No note for this day.</p>
        )}
        <button
          type="button"
          onClick={() => {
            setResult(null);
            setEditing(true);
          }}
          className="shrink-0 text-ahead-soft hover:underline"
        >
          {saved ? "Edit" : "Add a note"}
        </button>
      </div>
    );
  }

  function save(event: React.FormEvent) {
    event.preventDefault();
    const sent = text;
    startTransition(async () => {
      try {
        const next = await saveDayNoteAction(day, sent);
        setResult(next);
        if (next.status === "saved") {
          setSaved(sent.trim());
          setEditing(false);
        }
      } catch {
        // Usually a new version of the site went live since this page loaded.
        setResult({ status: "failed", message: "Couldn't save. Reload the page and try again." });
      }
    });
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-2">
      <label htmlFor={id} className="text-xs text-faint">
        Only you can see this.
      </label>
      <textarea
        id={id}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={MAX_NOTE_LENGTH}
        rows={2}
        placeholder="How did today go? e.g. practiced full clears on Viego, stopped after two losses"
        className="w-full resize-y rounded-lg border border-line-strong bg-page px-3 py-2 text-note text-ink placeholder:text-placeholder focus:border-ahead"
      />
      <div className="flex flex-wrap items-center gap-3 text-note">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-ahead px-4 py-1.5 font-semibold text-page hover:bg-ahead-soft disabled:opacity-60"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => {
            setText(saved);
            setEditing(false);
          }}
          className="text-muted hover:text-ink"
        >
          Cancel
        </button>
        {result?.status === "failed" && (
          <p role="status" className="text-behind">
            {result.message}
          </p>
        )}
      </div>
    </form>
  );
}
