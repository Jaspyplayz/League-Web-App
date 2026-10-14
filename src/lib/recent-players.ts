import { isRegion, type Region } from "./regions";

// Players you've looked at lately, newest first. The list lives in your own
// browser (localStorage), so it needs no account and never reaches our server.
// These helpers are plain functions on the saved text, so they can be tested
// without a browser; src/components/recent-players.tsx does the reading and
// writing.

export type RecentPlayer = { region: Region; gameName: string; tagLine: string };

export const RECENT_PLAYERS_KEY = "turnpoint:recent-players";
export const MAX_RECENT_PLAYERS = 6;

// Turns the saved text back into a list. Anything unexpected (no saved list
// yet, a hand-edited value, an older format) gives an empty or shorter list
// instead of breaking the page.
export function parseRecentPlayers(saved: string | null): RecentPlayer[] {
  if (!saved) return [];
  let data: unknown;
  try {
    data = JSON.parse(saved);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  return data.filter(isRecentPlayer).slice(0, MAX_RECENT_PLAYERS);
}

function isRecentPlayer(value: unknown): value is RecentPlayer {
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
// dropped so each player shows once; Riot IDs aren't case sensitive, so
// "faker#kr1" and "Faker#KR1" count as the same player.
export function addRecentPlayer(list: RecentPlayer[], player: RecentPlayer): RecentPlayer[] {
  const rest = list.filter((p) => !samePlayer(p, player));
  return [player, ...rest].slice(0, MAX_RECENT_PLAYERS);
}

export function removeRecentPlayer(list: RecentPlayer[], player: RecentPlayer): RecentPlayer[] {
  return list.filter((p) => !samePlayer(p, player));
}

function samePlayer(a: RecentPlayer, b: RecentPlayer): boolean {
  return (
    a.region === b.region &&
    a.gameName.toLowerCase() === b.gameName.toLowerCase() &&
    a.tagLine.toLowerCase() === b.tagLine.toLowerCase()
  );
}
