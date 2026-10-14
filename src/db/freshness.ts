// How long each kind of cached Riot data stays usable before we ask Riot
// again. Matches and timelines aren't here: they never change, so they
// never expire.
export const TTL_MS = {
  // A player's profile (icon, level, rank and latest match IDs) is a saved
  // snapshot, like op.gg's. A visit after this long fetches a new one.
  profile: 24 * 60 * 60 * 1000,
  // Minimum gap between two "Update" clicks for the same player, so nobody
  // can spend the Riot rate limit by clicking over and over.
  updateCooldown: 2 * 60 * 1000,
} as const;

// True if data fetched at `fetchedAt` is still within `ttlMs`.
// Null means it was never fetched, so it's never fresh.
export function isFresh(
  fetchedAt: Date | null | undefined,
  ttlMs: number,
  now: Date = new Date(),
): boolean {
  if (!fetchedAt) return false;
  return now.getTime() - fetchedAt.getTime() < ttlMs;
}

// Whole seconds until a profile fetched at `fetchedAt` can be updated again;
// 0 means it can be updated now. Rounded up, so "1" still means "wait".
export function secondsUntilUpdate(
  fetchedAt: Date | null | undefined,
  now: Date = new Date(),
): number {
  if (!fetchedAt) return 0;
  const readyAt = fetchedAt.getTime() + TTL_MS.updateCooldown;
  return Math.max(0, Math.ceil((readyAt - now.getTime()) / 1000));
}
