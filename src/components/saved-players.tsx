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
import { panelClass } from "./ui/panel";

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

export function useRecentPlayers(): SavedPlayer[] {
  return useSavedPlayers(RECENT_PLAYERS_KEY);
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
          ? `You can pin up to ${MAX_PINNED_PLAYERS} players. Unpin one in the list under the search box first.`
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

// The list that drops down under the search box when you click into it, like
// op.gg's: players you pinned, then the ones you searched for last, newest
// first. A pinned player isn't repeated under Recent. Typing narrows both
// lists to the players whose Riot ID contains what you typed, and the menu
// hides itself when nothing matches. `onPick` closes the menu once you've
// picked a player.
export function SavedPlayersMenu({ query, onPick }: { query: string; onPick: () => void }) {
  const pinnedAll = useSavedPlayers(PINNED_PLAYERS_KEY);
  const recentAll = useSavedPlayers(RECENT_PLAYERS_KEY).filter((p) => !hasPlayer(pinnedAll, p));
  const typed = query.trim().toLowerCase();
  const matches = (p: SavedPlayer) => riotId(p).toLowerCase().includes(typed);
  const pinned = pinnedAll.filter(matches);
  const recent = recentAll.filter(matches);
  if (pinned.length === 0 && recent.length === 0) return null;

  return (
    <div
      // Clicking inside the menu keeps the cursor in the search box, so the
      // menu doesn't close under the mouse before the click lands.
      onMouseDown={(event) => event.preventDefault()}
      className={`${panelClass} absolute inset-x-0 top-full z-20 mt-2 flex flex-col gap-1 py-2 shadow-lg`}
    >
      {recent.length > 0 && (
        <MenuSection
          id="recent-players-label"
          label="Recent"
          action={
            // Only offered before you type, so it can't look like it clears
            // just the players that match.
            typed === "" && (
              <button
                type="button"
                onClick={() => update(RECENT_PLAYERS_KEY, () => [])}
                className="hover:text-ink hover:underline"
              >
                Clear
              </button>
            )
          }
        >
          {recent.map((p) => (
            <MenuRow
              key={key(p)}
              player={p}
              // Picking a recent player moves them back to the top.
              onPick={() => {
                update(RECENT_PLAYERS_KEY, (list) => addRecentPlayer(list, p));
                onPick();
              }}
            >
              <button
                type="button"
                onClick={() => update(RECENT_PLAYERS_KEY, (list) => removePlayer(list, p))}
                aria-label={`Remove ${riotId(p)} from recent players`}
                title="Remove"
                className="flex size-9 items-center justify-center text-lg text-faint hover:text-ink"
              >
                ×
              </button>
            </MenuRow>
          ))}
        </MenuSection>
      )}
      {pinned.length > 0 && (
        <MenuSection id="pinned-players-label" label="Pinned">
          {pinned.map((p) => (
            <MenuRow key={key(p)} player={p} onPick={onPick}>
              <button
                type="button"
                onClick={() => update(PINNED_PLAYERS_KEY, (list) => removePlayer(list, p))}
                aria-label={`Unpin ${riotId(p)}`}
                title="Unpin"
                className="flex size-9 items-center justify-center text-ahead hover:text-ink"
              >
                <StarIcon size={14} filled />
              </button>
            </MenuRow>
          ))}
        </MenuSection>
      )}
    </div>
  );
}

function MenuSection({
  id,
  label,
  action,
  children,
}: {
  id: string;
  label: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-4 py-1.5 font-mono text-[11px] tracking-[0.12em] text-faint uppercase">
        <span id={id}>{label}</span>
        {action}
      </div>
      <ul aria-labelledby={id} className="flex flex-col">
        {children}
      </ul>
    </div>
  );
}

// One player: their region and Riot ID, linking to their profile, with a
// small button on the right (remove or unpin).
function MenuRow({
  player: p,
  onPick,
  children,
}: {
  player: SavedPlayer;
  onPick: () => void;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-center pr-2 hover:bg-surface-hover">
      <Link
        href={`/player/${p.region}/${toSlug(p)}`}
        onClick={onPick}
        className="flex min-w-0 flex-1 items-center gap-3 px-4 py-2 text-ink-soft hover:text-ink"
      >
        <span className="hud-cut-sm w-10 flex-none border border-frame py-0.5 text-center font-mono text-[11px] text-faint">
          {p.region.toUpperCase()}
        </span>
        <span className="truncate">
          {p.gameName}
          <span className="text-faint">#{p.tagLine}</span>
        </span>
      </Link>
      {children}
    </li>
  );
}

function riotId(p: SavedPlayer): string {
  return `${p.gameName}#${p.tagLine}`;
}

function key(p: SavedPlayer): string {
  return `${p.region}/${riotId(p)}`;
}
