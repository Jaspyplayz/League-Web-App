"use client";

import Link from "next/link";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import {
  addRecentPlayer,
  parseRecentPlayers,
  RECENT_PLAYERS_KEY,
  removeRecentPlayer,
  type RecentPlayer,
} from "@/lib/recent-players";
import { toSlug } from "@/lib/riot-id";

// The recent players list is kept in this browser's localStorage. These
// components run in the browser ("use client") because the server can't see
// localStorage.

// Components showing the list re-render when it changes: in this tab through
// `listeners`, and in other tabs through the browser's "storage" event.
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

// localStorage can throw, for example when the browser blocks site data, so
// every read and write is wrapped. The list is a nice extra; the site works
// without it.
function readSaved(): string | null {
  try {
    return localStorage.getItem(RECENT_PLAYERS_KEY);
  } catch {
    return null;
  }
}

function save(list: RecentPlayer[]) {
  try {
    localStorage.setItem(RECENT_PLAYERS_KEY, JSON.stringify(list));
  } catch {
    // Not saved this time; nothing else to do.
  }
  listeners.forEach((onChange) => onChange());
}

function useRecentPlayers(): RecentPlayer[] {
  // useSyncExternalStore reads from outside React (here, localStorage). The
  // server render has no saved list, so it shows nothing, and the browser
  // fills the list in right after the page loads.
  const saved = useSyncExternalStore(subscribe, readSaved, () => null);
  return useMemo(() => parseRecentPlayers(saved), [saved]);
}

// Renders nothing; adds the player whose page is open to the recent list.
export function RememberPlayer({ region, gameName, tagLine }: RecentPlayer) {
  useEffect(() => {
    save(addRecentPlayer(parseRecentPlayers(readSaved()), { region, gameName, tagLine }));
  }, [region, gameName, tagLine]);
  return null;
}

// A row of links back to the players you looked at last, newest first. Hidden
// until you've looked someone up.
export function RecentPlayers() {
  const players = useRecentPlayers();
  if (players.length === 0) return null;

  return (
    <div className="flex items-start gap-2.5 text-sm text-faint">
      <span id="recent-players-label" className="py-2">
        Recent
      </span>
      <ul aria-labelledby="recent-players-label" className="flex min-w-0 flex-1 flex-wrap gap-2">
        {players.map((p) => {
          const riotId = `${p.gameName}#${p.tagLine}`;
          return (
            <li
              key={`${p.region}/${riotId}`}
              className="flex items-center rounded-full border border-line-strong font-mono text-ink-soft transition-colors hover:border-ahead"
            >
              <Link
                href={`/player/${p.region}/${toSlug(p)}`}
                className="py-2 pl-3.5 pr-1 hover:text-ink"
              >
                <span className="text-faint">{p.region.toUpperCase()}</span> {riotId}
              </Link>
              <button
                type="button"
                onClick={() => save(removeRecentPlayer(parseRecentPlayers(readSaved()), p))}
                aria-label={`Remove ${riotId} from recent players`}
                className="rounded-full px-2.5 py-2 text-faint hover:text-ink"
              >
                ×
              </button>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={() => save([])}
            className="px-1.5 py-2 underline-offset-2 hover:text-ink hover:underline"
          >
            Clear
          </button>
        </li>
      </ul>
    </div>
  );
}
