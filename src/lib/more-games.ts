import type { QueueFilter } from "@/lib/queue-filters";

// The "Show 10 more games" button under the profile's match list. Each click
// adds the next 10 games under the ones already shown, like op.gg's "Show
// more", so the "Last 20 games" summary above the list covers everything on
// the page. The URL carries how many games to show (?games=20), so a
// refresh or a shared link shows the same list.
//
// It stops at 50: every game not yet in the database costs a Riot call the
// first time, and 50 is more than anyone scrolls through on a profile.

export const GAMES_STEP = 10;
export const MAX_GAMES = 50;

// ?games= from the URL. Anything that isn't a multiple of 10 between 10 and
// 50 means the first 10, so a mistyped link still shows a page instead of an
// error.
export function readGameCount(value: string | string[] | undefined): number {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return GAMES_STEP;
  const games = Number(value);
  if (games < GAMES_STEP || games > MAX_GAMES || games % GAMES_STEP !== 0) return GAMES_STEP;
  return games;
}

// Whether to offer the button. A full list means Riot may have more (a short
// one means it doesn't), and the list stops growing at MAX_GAMES.
export function hasMoreGames(idsShown: number, count: number): boolean {
  return idsShown === count && count < MAX_GAMES;
}

// The link for the match list showing `count` games. Keeps the game-mode tab.
// `anchor` is the id to scroll to: the first new row, so the click lands where
// the list left off instead of back at the top.
export function matchListHref(
  playerPath: string,
  queue: QueueFilter,
  count: number,
  anchor = "matches-heading",
): string {
  const query = new URLSearchParams();
  if (queue.id !== "all") query.set("queue", queue.id);
  if (count !== GAMES_STEP) query.set("games", String(count));
  const search = query.size > 0 ? `?${query}` : "";
  return `${playerPath}${search}#${anchor}`;
}
