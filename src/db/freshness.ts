// How long each kind of cached Riot data stays usable before we ask Riot
// again. Matches and timelines aren't here: they never change, so they
// never expire.
export const TTL_MS = {
  // account-v1 + summoner-v4: Riot ID, icon, level.
  profile: 24 * 60 * 60 * 1000,
  // league-v4: tier, LP, wins and losses.
  ranked: 15 * 60 * 1000,
  // Minimum gap between two "Update" clicks for the same player.
  matchIdsCooldown: 2 * 60 * 1000,
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
