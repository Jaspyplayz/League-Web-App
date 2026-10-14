// Benchmarks: the solo queue players of each rank that Insights compares you
// with. The collector script (scripts/collect-benchmarks.ts) uses these to
// pick whose games to download, and Insights uses them to find one-tricks.

// A one-trick plays one champion in at least this share of their recent
// ranked games...
export const ONE_TRICK_SHARE = 0.6;
// ...counting their last this-many games...
export const ONE_TRICK_WINDOW = 20;
// ...and only once we have at least this many of them, so 3 Lee Sin games out
// of 4 doesn't make someone a Lee Sin one-trick.
export const MIN_ONE_TRICK_GAMES = 10;

type RankedPlayer = {
  puuid: string;
  leaguePoints: number;
  wins: number;
  losses: number;
  inactive?: boolean;
};

// `count` players spread evenly from the top to the bottom of a ladder or
// division by LP, so the sample stands for the whole tier rather than just
// its best players. Players with fewer than ONE_TRICK_WINDOW ranked games
// this season, or who have stopped playing, are skipped: they don't have the
// recent games to collect.
export function samplePlayers(entries: RankedPlayer[], count: number): string[] {
  const active = entries
    .filter((e) => !e.inactive && e.wins + e.losses >= ONE_TRICK_WINDOW)
    .sort((a, b) => b.leaguePoints - a.leaguePoints);
  if (active.length <= count) return active.map((e) => e.puuid);
  const step = active.length / count;
  return Array.from({ length: count }, (_, i) => active[Math.floor(i * step)].puuid);
}

type PlayedGame = { puuid: string; championName: string; startedAt: number };

// The champion this player one-tricks, or null. `games` are one player's games
// in any order.
export function oneTrickChampion(games: Omit<PlayedGame, "puuid">[]): string | null {
  const recent = [...games].sort((a, b) => b.startedAt - a.startedAt).slice(0, ONE_TRICK_WINDOW);
  if (recent.length < MIN_ONE_TRICK_GAMES) return null;

  const counts = new Map<string, number>();
  for (const g of recent) counts.set(g.championName, (counts.get(g.championName) ?? 0) + 1);
  const [champion, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return count / recent.length >= ONE_TRICK_SHARE ? champion : null;
}

// PUUID -> the champion they one-trick, for every one-trick among `games`.
export function findOneTricks(games: PlayedGame[]): Map<string, string> {
  const byPlayer = Map.groupBy(games, (g) => g.puuid);
  const oneTricks = new Map<string, string>();
  for (const [puuid, theirs] of byPlayer) {
    const champion = oneTrickChampion(theirs);
    if (champion) oneTricks.set(puuid, champion);
  }
  return oneTricks;
}
