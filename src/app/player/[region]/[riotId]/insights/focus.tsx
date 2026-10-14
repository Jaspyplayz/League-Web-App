"use client";

import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import type { WeaknessId } from "@/lib/analyzer/trends";
import {
  FOCUS_GOALS,
  FOCUS_KEY,
  parseFocuses,
  saveFocus,
  summarizeFocus,
  type Focus,
  type FocusGame,
} from "@/lib/focus";

// Focus goals: pick one recurring weakness and see every game after that
// checked against it. The pick is kept in this browser's localStorage (see
// src/lib/focus.ts), so these components run in the browser ("use client").
// The reading and writing works like src/components/recent-players.tsx.

const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

// localStorage can throw, for example when the browser blocks site data. The
// focus is an extra; Insights works without it.
function readSaved(): string | null {
  try {
    return localStorage.getItem(FOCUS_KEY);
  } catch {
    return null;
  }
}

function save(player: string, focus: Focus | null) {
  try {
    localStorage.setItem(FOCUS_KEY, saveFocus(readSaved(), player, focus));
  } catch {
    // Not saved this time; nothing else to do.
  }
  listeners.forEach((onChange) => onChange());
}

// The player's focus, or null. The server has no saved focus, so it renders
// none, and the browser fills it in right after the page loads.
function useFocus(player: string): Focus | null {
  const saved = useSyncExternalStore(subscribe, readSaved, () => null);
  return useMemo(() => parseFocuses(saved)[player] ?? null, [saved, player]);
}

// The button next to each recurring weakness. Picking another weakness
// replaces the old focus: one at a time keeps it a focus.
export function FocusButton({ player, id }: { player: string; id: WeaknessId }) {
  const focus = useFocus(player);
  if (focus?.id === id) {
    return <span className="shrink-0 font-mono text-xs text-ahead-soft">Your focus</span>;
  }
  return (
    <button
      type="button"
      onClick={() => save(player, { id, setAt: Date.now() })}
      className="shrink-0 rounded-full border border-line-strong px-3 py-1.5 text-sm text-ink-soft transition-colors hover:border-ahead hover:text-ink"
    >
      Focus on this
    </button>
  );
}

// The panel at the top of Insights: the games since you picked your focus,
// each one marked, and how that compares with the games before. It reports
// how each game went and leaves the judging to you.
export function FocusPanel({
  player,
  games,
  current,
  playerPath,
}: {
  player: string;
  games: FocusGame[];
  // The weaknesses the box shows right now.
  current: WeaknessId[];
  playerPath: string;
}) {
  const focus = useFocus(player);
  const summary = useMemo(() => (focus ? summarizeFocus(games, focus) : null), [games, focus]);
  if (!focus || !summary) return null;

  const { since, counted, avoided, before, streak } = summary;
  const setOn = shortDate(focus.setAt);
  return (
    <section
      aria-labelledby="focus-heading"
      className="flex flex-col gap-3.5 rounded-2xl border border-ahead/30 bg-ahead/[0.07] p-[22px]"
    >
      <div className="flex items-center justify-between gap-4">
        <h2
          id="focus-heading"
          className="font-mono text-xs font-medium uppercase tracking-[0.12em] text-ahead-soft"
        >
          Your focus
        </h2>
        <button
          type="button"
          onClick={() => save(player, null)}
          className="text-sm text-faint underline-offset-2 hover:text-ink hover:underline"
        >
          Stop focusing
        </button>
      </div>
      <p className="font-semibold">{FOCUS_GOALS[focus.id]}</p>

      {counted === 0 ? (
        <p className="text-[15px] text-ink-soft">
          Picked {setOn}. Games you play from now on show up here, each one checked against
          it.
        </p>
      ) : (
        <p className="text-[15px] text-ink-soft">
          Since {setOn}, you managed it in {avoided} of {counted}{" "}
          {counted === 1 ? "game" : "games"}
          {streak > 1 && `, including the last ${streak} in a row`}.
          {before.counted > 0 &&
            ` Before that: ${before.avoided} of ${before.counted} (${percent(before)}).`}
        </p>
      )}

      {since.length > 0 && (
        <ol aria-label="Games since you picked this focus" className="flex flex-wrap gap-1.5">
          {since.map((r) => {
            const what =
              r.avoided === null
                ? "doesn't count"
                : r.avoided
                  ? "managed it"
                  : "didn't manage it";
            const color =
              r.avoided === null
                ? "border border-line-strong"
                : r.avoided
                  ? "bg-ahead"
                  : "bg-behind";
            return (
              <li key={r.matchId}>
                <Link
                  href={`${playerPath}/match/${r.matchId}`}
                  title={`${shortDate(r.startedAt)}: ${what}`}
                  aria-label={`Game on ${shortDate(r.startedAt)}: ${what}`}
                  className={`block h-5 w-5 rounded-[5px] hover:opacity-75 ${color}`}
                />
              </li>
            );
          })}
        </ol>
      )}

      {counted > 0 && !current.includes(focus.id) && (
        <p className="text-[13px] text-faint">
          This isn&apos;t one of your recurring weaknesses in these games anymore.
        </p>
      )}
      <p className="text-[13px] text-faint">
        Saved in this browser only. Games that end too early to tell, or where the rule
        doesn&apos;t apply, show as outlines and don&apos;t count.
      </p>
    </section>
  );
}

function shortDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function percent({ counted, avoided }: { counted: number; avoided: number }): string {
  return `${Math.round((avoided / counted) * 100)}%`;
}
