import type { LeagueEntry } from "@/lib/riot/types";
import { rankScore } from "@/lib/tiers";

// Riot only tells us a player's rank right now, not how it changed. So each
// time Turnpoint saves a profile it also keeps a dated copy of the rank in
// rank_history (src/db/schema.ts), and the LP graph on the profile is drawn
// from those copies. That means the graph only covers time since Turnpoint
// started recording, and only for players someone looked up.

type Rank = Pick<LeagueEntry, "queueType" | "tier" | "rank" | "leaguePoints" | "wins" | "losses">;
export type RankPoint = Rank & { recordedAt: Date };

// Which of the current ranks need a new history row: those with no row yet,
// or whose rank, LP or game count changed since the last one. Profiles are
// refreshed daily and on every Update click, so skipping unchanged ranks
// keeps the table to one row per change rather than one per refresh.
export function ranksToRecord(latest: RankPoint[], current: Rank[]): Rank[] {
  return current.filter((entry) => {
    const last = latest.find((p) => p.queueType === entry.queueType);
    return (
      !last ||
      last.tier !== entry.tier ||
      last.rank !== entry.rank ||
      last.leaguePoints !== entry.leaguePoints ||
      last.wins + last.losses !== entry.wins + entry.losses
    );
  });
}

export const GRAPH_DAYS = 30;

// One dot on the LP graph: `x` is where the day falls in the window, from 0
// (30 days ago) to 1 (now), and `score` is rankScore() of the rank then.
export type GraphPoint = { x: number; score: number; label: string };

// The points for one queue's graph, oldest first. The last point before the
// window opens is kept too, pinned to its left edge, so the line starts at
// the rank the player had 30 days ago instead of partway across.
export function graphPoints(history: RankPoint[], queueType: string, now: Date): GraphPoint[] {
  const span = GRAPH_DAYS * 24 * 60 * 60 * 1000;
  const start = now.getTime() - span;
  const points = history
    .filter((p) => p.queueType === queueType)
    .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());

  const before = points.filter((p) => p.recordedAt.getTime() < start).at(-1);
  const inWindow = points.filter((p) => p.recordedAt.getTime() >= start);
  return [...(before ? [before] : []), ...inWindow].flatMap((p) => {
    const score = rankScore(p.tier, p.rank, p.leaguePoints);
    if (score === null) return [];
    const x = Math.max(0, (p.recordedAt.getTime() - start) / span);
    return [{ x, score, label: `${p.tier} ${p.rank} ${p.leaguePoints} LP` }];
  });
}
