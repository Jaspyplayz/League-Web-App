import type { QueueFilter } from "@/lib/queue-filters";
import type { Match } from "@/lib/riot/types";

// The "Show 10 older games" button under the profile's match list. Each click
// shows the 10 games before the oldest one on the page. The URL carries that
// game's time (?before=, seconds since 1970) instead of a page number, so new
// games played in the meantime can't shift the list and repeat a game.
//
// Riot keeps about two years of games, but the button stops at two months:
// that's as far back as anyone looks on a profile, and every page of older
// games costs Riot calls the first time.

export const OLDER_GAMES_DAYS = 60;
const DAY_S = 24 * 60 * 60;

// The earliest time the button reaches, in seconds since 1970, which is what
// Riot's match list takes. `now` is in milliseconds, like Date.now().
export function oldestAllowed(now: number): number {
  return Math.floor(now / 1000) - OLDER_GAMES_DAYS * DAY_S;
}

// ?before= from the URL. Anything that isn't a whole number of seconds within
// the last two months means "the latest games", so a mistyped or old link
// still shows a page instead of an error.
export function readBefore(value: string | string[] | undefined, now: number): number | null {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const before = Number(value);
  if (before <= oldestAllowed(now) || before > Math.floor(now / 1000)) return null;
  return before;
}

// The ?before= for the page after `oldest`, the last game on this one: a
// second before that game was created, so it isn't listed again. Riot's
// gameCreation is when the game was made, a little before it started; the
// start time is the fallback in case a match ever lacks it.
export function nextBefore(oldest: Match): number {
  const { gameCreation, gameStartTimestamp } = oldest.info;
  return Math.floor(Math.min(gameCreation ?? gameStartTimestamp, gameStartTimestamp) / 1000) - 1;
}

// Whether to offer the button. A full page means Riot may have more (a short
// one means it doesn't), and the next page has to start inside two months.
export function hasOlderGames(
  idsOnPage: number,
  pageSize: number,
  next: number,
  now: number,
): boolean {
  return idsOnPage === pageSize && next > oldestAllowed(now);
}

// The link for a page of the match list. `before` null is the latest games.
// Keeps the game-mode tab, and jumps to the list's heading so a click near the
// bottom of the page lands on the new games' first row.
export function matchListHref(
  playerPath: string,
  queue: QueueFilter,
  before: number | null,
): string {
  const query = new URLSearchParams();
  if (queue.id !== "all") query.set("queue", queue.id);
  if (before !== null) query.set("before", String(before));
  const search = query.size > 0 ? `?${query}` : "";
  return `${playerPath}${search}#matches-heading`;
}
