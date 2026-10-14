"use client";

import Link from "next/link";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import {
  addRecentPlayer,
  hasPlayer,
  isPendingSearch,
  MAX_PINNED_PLAYERS,
  MAX_RECENT_PLAYERS,
  parsePendingSearch,
  parseSavedPlayers,
  PENDING_SEARCH_KEY,
  PINNED_PLAYERS_KEY,
  RECENT_PLAYERS_KEY,
  removePlayer,
  togglePinnedPlayer,
  type SavedPlayer,
} from "@/lib/saved-players";
import { toSlug } from "@/lib/riot-id";
import { StarIcon } from "./icons";

// The recent and pinned player lists are kept in this browser's localStorage
// (see src/lib/saved-players.ts). These components run in the browser
// ("use client") because the server can't see localStorage.

type ListKey = typeof RECENT_PLAYERS_KEY | typeof PINNED_PLAYERS_KEY;
const MAX: Record<ListKey, number> = {
  [RECENT_PLAYERS_KEY]: MAX_RECENT_PLAYERS,
  [PINNED_PLAYERS_KEY]: MAX_PINNED_PLAYERS,
};

// Components showing a list re-render when it changes: in this tab through
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
// every read and write is wrapped. The lists are a nice extra; the site works
// without them.
function readSaved(key: ListKey): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function read(key: ListKey): SavedPlayer[] {
  return parseSavedPlayers(readSaved(key), MAX[key]);
}

// Takes a function from the current list to the new one, so each change
// starts from what's saved right now (another tab may have changed it).
function update(key: ListKey, change: (list: SavedPlayer[]) => SavedPlayer[]) {
  try {
    localStorage.setItem(key, JSON.stringify(change(read(key))));
  } catch {
    // Not saved this time; nothing else to do.
  }
  listeners.forEach((onChange) => onChange());
}

function useSavedPlayers(key: ListKey): SavedPlayer[] {
  // useSyncExternalStore reads from outside React (here, localStorage). The
  // server render has no saved lists, so it shows nothing, and the browser
  // fills them in right after the page loads.
  const saved = useSyncExternalStore(
    subscribe,
    () => readSaved(key),
    () => null,
  );
  return useMemo(() => parseSavedPlayers(saved, MAX[key]), [saved, key]);
}

// The search box calls this when you search, before the page changes. See
// PENDING_SEARCH_KEY in src/lib/saved-players.ts for why it's saved for later
// instead of going straight into Recent.
export function noteSearch(player: SavedPlayer) {
  try {
    sessionStorage.setItem(PENDING_SEARCH_KEY, JSON.stringify({ ...player, at: Date.now() }));
  } catch {
    // Without storage the search just won't show under Recent.
  }
}

// Renders nothing. If you got to this profile by searching for it, adds the
// player to Recent; if you clicked through from somewhere else, does nothing.
export function RememberSearchedPlayer({ region, gameName, tagLine }: SavedPlayer) {
  useEffect(() => {
    const player = { region, gameName, tagLine };
    let pending = null;
    try {
      pending = parsePendingSearch(sessionStorage.getItem(PENDING_SEARCH_KEY));
    } catch {
      return;
    }
    if (!isPendingSearch(pending, player, Date.now())) return;
    try {
      // Used up: reloading the page or coming back later doesn't count again.
      sessionStorage.removeItem(PENDING_SEARCH_KEY);
    } catch {
      // Nothing else to do.
    }
    update(RECENT_PLAYERS_KEY, (list) => addRecentPlayer(list, player));
  }, [region, gameName, tagLine]);
  return null;
}

// The star next to a player's name on their profile.
export function PinButton(player: SavedPlayer) {
  const pinned = useSavedPlayers(PINNED_PLAYERS_KEY);
  const isPinned = hasPlayer(pinned, player);
  const full = !isPinned && pinned.length >= MAX_PINNED_PLAYERS;
  const riotId = `${player.gameName}#${player.tagLine}`;

  return (
    <button
      type="button"
      onClick={() => update(PINNED_PLAYERS_KEY, (list) => togglePinnedPlayer(list, player))}
      disabled={full}
      // aria-pressed tells screen readers this is an on/off toggle.
      aria-pressed={isPinned}
      aria-label={isPinned ? `Unpin ${riotId}` : `Pin ${riotId}`}
      title={
        full
          ? `You can pin up to ${MAX_PINNED_PLAYERS} players. Unpin one on the home page first.`
          : isPinned
            ? "Unpin this player"
            : "Pin this player to the home page"
      }
      className={`inline-flex size-9 items-center justify-center rounded-lg border transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        isPinned
          ? "border-ahead bg-ahead/15 text-ahead"
          : "border-line-strong text-faint hover:border-ahead hover:text-ink"
      }`}
    >
      <StarIcon size={18} filled={isPinned} />
    </button>
  );
}

const chip =
  "flex items-center rounded-full border border-line-strong font-mono text-ink-soft transition-colors hover:border-ahead";

// Two rows under the search box: players you pinned, then the ones you
// searched for last. A pinned player isn't repeated under Recent. Each row is hidden
// while it's empty.
export function SavedPlayers() {
  const pinned = useSavedPlayers(PINNED_PLAYERS_KEY);
  const recent = useSavedPlayers(RECENT_PLAYERS_KEY).filter((p) => !hasPlayer(pinned, p));
  if (pinned.length === 0 && recent.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {pinned.length > 0 && (
        <PlayerRow id="pinned-players-label" label="Pinned">
          {pinned.map((p) => (
            <li key={key(p)} className={chip}>
              <PlayerLink player={p} />
              <button
                type="button"
                onClick={() => update(PINNED_PLAYERS_KEY, (list) => removePlayer(list, p))}
                aria-label={`Unpin ${riotId(p)}`}
                title="Unpin"
                className="rounded-full px-2.5 py-2 text-ahead hover:text-ink"
              >
                <StarIcon size={14} filled />
              </button>
            </li>
          ))}
        </PlayerRow>
      )}
      {recent.length > 0 && (
        <PlayerRow id="recent-players-label" label="Recent">
          {recent.map((p) => (
            <li key={key(p)} className={chip}>
              <PlayerLink player={p} />
              <button
                type="button"
                onClick={() => update(RECENT_PLAYERS_KEY, (list) => removePlayer(list, p))}
                aria-label={`Remove ${riotId(p)} from recent players`}
                className="rounded-full px-2.5 py-2 text-faint hover:text-ink"
              >
                ×
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => update(RECENT_PLAYERS_KEY, () => [])}
              className="px-1.5 py-2 underline-offset-2 hover:text-ink hover:underline"
            >
              Clear
            </button>
          </li>
        </PlayerRow>
      )}
    </div>
  );
}

function PlayerRow({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5 text-sm text-faint">
      <span id={id} className="w-14 flex-none py-2">
        {label}
      </span>
      <ul aria-labelledby={id} className="flex min-w-0 flex-1 flex-wrap gap-2">
        {children}
      </ul>
    </div>
  );
}

function PlayerLink({ player: p }: { player: SavedPlayer }) {
  return (
    <Link href={`/player/${p.region}/${toSlug(p)}`} className="py-2 pl-3.5 pr-1 hover:text-ink">
      <span className="text-faint">{p.region.toUpperCase()}</span> {riotId(p)}
    </Link>
  );
}

function riotId(p: SavedPlayer): string {
  return `${p.gameName}#${p.tagLine}`;
}

function key(p: SavedPlayer): string {
  return `${p.region}/${riotId(p)}`;
}
