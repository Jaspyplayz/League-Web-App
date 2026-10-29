import type { QueueFilter } from "@/lib/queue-filters";

// The "Show 10 more games" button under the profile's match list. Each click
// adds the next 10 games under the ones already shown, like op.gg's "Show
// more", so the "Last 20 games" summary above the list covers everything on
// the page. The URL carries how many games to show (?games=20), so a
// refresh or a shared link shows the same list.
//
// It keeps going until the list reaches back two months, so every game of
// the last two months can be shown. MAX_GAMES stops a list of someone who
// plays all day from growing past what one page can show quickly: each view
// reads every listed game from the database again.

export const GAMES_STEP = 10;
export const HISTORY_DAYS = 60;
export const MAX_GAMES = 200;

// Riot calls one view of the list may spend on games that aren't saved yet.
// A click needs 10; a link straight to ?games=200 gets the rest over a few
// refreshes instead of spending the whole dev key allowance (100 calls per 2
// minutes) at once.
export const MISSING_PER_VIEW = 2 * GAMES_STEP;

const DAY_MS = 24 * 60 * 60 * 1000;

// ?games= from the URL. Anything that isn't a multiple of 10 between 10 and
// MAX_GAMES means the first 10, so a mistyped link still shows a page
// instead of an error.
export function readGameCount(value: string | string[] | undefined): number {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return GAMES_STEP;
  const games = Number(value);
  if (games < GAMES_STEP || games > MAX_GAMES || games % GAMES_STEP !== 0) return GAMES_STEP;
  return games;
}

// What goes under the list:
// - "more": the "Show 10 more games" button.
// - "two-months": the oldest game shown is over two months old, so the list
//   already covers the last two months.
// - "max": the list is MAX_GAMES long and stops there.
// - "end": Riot has no older games (a short list), so nothing.
export type ListEnd = "more" | "two-months" | "max" | "end";

// `idsShown` is how many match IDs Riot gave for a list of `count`, and
// `oldestStartedAt` when the oldest game shown started (ms since 1970), or
// null when none loaded.
export function listEnd(
  idsShown: number,
  count: number,
  oldestStartedAt: number | null,
  now: number,
): ListEnd {
  // A short list means Riot ran out of games.
  if (idsShown < count) return "end";
  if (oldestStartedAt !== null && oldestStartedAt < now - HISTORY_DAYS * DAY_MS) {
    return "two-months";
  }
  if (count >= MAX_GAMES) return "max";
  return "more";
}

// Whether this is the profile's plain URL, with no ?queue= or ?games= (the
// All tab and its first 10 games, the link matchListHref writes for them).
// Only that page loads more of the season's games (src/lib/season-store.ts),
// so a crawler opening every tab and longer list of a profile can't load 10
// games on each. Its 10 games are also the profile snapshot's
// (PROFILE_MATCH_COUNT, which is GAMES_STEP), so listing them needs no Riot
// call.
export function isPlainProfilePage(queue: QueueFilter, count: number): boolean {
  return queue.id === "all" && count === GAMES_STEP;
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
