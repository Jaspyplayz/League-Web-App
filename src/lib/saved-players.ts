import { isRegion, type Region } from "./regions";

// Two short lists of players, kept in your own browser (localStorage), so they
// need no account and never reach our server:
// - recent: the players you looked at lately, newest first. Added
//   automatically each time you open a profile.
// - pinned: players you starred on their profile, so they stay at hand until
//   you unpin them.
// These helpers are plain functions on the saved text, so they can be tested
// without a browser; src/components/saved-players.tsx does the reading and
// writing.

export type SavedPlayer = { region: Region; gameName: string; tagLine: string };

export const RECENT_PLAYERS_KEY = "turnpoint:recent-players";
export const MAX_RECENT_PLAYERS = 5;

export const PINNED_PLAYERS_KEY = "turnpoint:pinned-players";
export const MAX_PINNED_PLAYERS = 10;

// Turns the saved text back into a list of at most `max` players. Anything
// unexpected (no saved list yet, a hand-edited value, an older format) gives
// an empty or shorter list instead of breaking the page.
export function parseSavedPlayers(saved: string | null, max: number): SavedPlayer[] {
  if (!saved) return [];
  let data: unknown;
  try {
    data = JSON.parse(saved);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  return data.filter(isSavedPlayer).slice(0, max);
}

function isSavedPlayer(value: unknown): value is SavedPlayer {
  if (typeof value !== "object" || value === null) return false;
  const { region, gameName, tagLine } = value as Record<string, unknown>;
  return (
    typeof region === "string" &&
    isRegion(region) &&
    typeof gameName === "string" &&
    typeof tagLine === "string"
  );
}

// Puts `player` at the front. If they're already in the list, the old entry is
// dropped so each player shows once.
export function addRecentPlayer(list: SavedPlayer[], player: SavedPlayer): SavedPlayer[] {
  const rest = list.filter((p) => !samePlayer(p, player));
  return [player, ...rest].slice(0, MAX_RECENT_PLAYERS);
}

export function removePlayer(list: SavedPlayer[], player: SavedPlayer): SavedPlayer[] {
  return list.filter((p) => !samePlayer(p, player));
}

export function hasPlayer(list: SavedPlayer[], player: SavedPlayer): boolean {
  return list.some((p) => samePlayer(p, player));
}

// The star button: pins the player, or unpins them if they're already pinned.
// New pins go at the end, so the pinned row keeps the order you built it in.
// Once the list is full, nothing more is pinned until you unpin someone;
// quietly dropping an older pin would be a surprise.
export function togglePinnedPlayer(list: SavedPlayer[], player: SavedPlayer): SavedPlayer[] {
  if (hasPlayer(list, player)) return removePlayer(list, player);
  if (list.length >= MAX_PINNED_PLAYERS) return list;
  return [...list, player];
}

// Riot IDs aren't case sensitive, so "faker#kr1" and "Faker#KR1" are the same
// player. The same name in two regions is two different players.
function samePlayer(a: SavedPlayer, b: SavedPlayer): boolean {
  return (
    a.region === b.region &&
    a.gameName.toLowerCase() === b.gameName.toLowerCase() &&
    a.tagLine.toLowerCase() === b.tagLine.toLowerCase()
  );
}
