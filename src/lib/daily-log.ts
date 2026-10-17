import type { WeaknessId } from "@/lib/analyzer/trends";
import type { Focus } from "@/lib/focus";

// The Log tab: a player's games grouped into days, newest first, so they can
// see how each day went (record, LP, game score, focus goal) and keep a short
// private note on it. These are plain functions so they can be tested
// without a browser or a database; the page is in
// src/app/player/[region]/[riotId]/log/.
//
// Days are in the viewer's own timezone, which only the browser knows. So the
// server sends every game with its start time, and the browser does the
// grouping with the functions below.

// How far back the log goes. Four weeks fits in one Riot match list request
// for anyone playing under 100 games a month.
export const LOG_DAYS = 28;

// One game, reduced to what the log shows.
export type LogGame = {
  matchId: string;
  startedAt: number;
  win: boolean;
  // Ranked solo/duo, the queue the LP is for.
  ranked: boolean;
  championName: string;
  // The champion's display name ("Lee Sin" for "LeeSin").
  championLabel: string;
  kills: number;
  deaths: number;
  assists: number;
  csPerMin: number;
  visionPerMin: number;
  // The 0 to 100 game score, or null for ARAM, Arena and similar.
  score: number | null;
  // Your gold minus your opponent's at 15 minutes, once the game's timeline
  // has been fetched (Insights and the match page fetch them too).
  goldAt15: number | null;
  // Whether the game showed each focus-goal weakness; null until the
  // timeline is in, or when the game has no role matchup.
  shows: Record<WeaknessId, boolean | null> | null;
  // The one-line AI recap of the game, once someone has written one on its
  // match page (see src/lib/recap.ts).
  recap: string | null;
};

// One saved copy of the player's solo/duo rank (see src/lib/rank-history.ts):
// when it was recorded, rankScore() of the rank, and wins plus losses.
export type LogRankPoint = { at: number; score: number; games: number };

export type LogDay = {
  day: string; // "2026-10-16"
  games: LogGame[]; // newest first
  wins: number;
  losses: number;
  ranked: number; // how many of the games were solo/duo
  // LP gained (positive) or lost (negative) in solo/duo, or null when the
  // saved ranks can't tell (see dayLp).
  lp: number | null;
};

// "2026-10-16" for the day the time falls on, in this computer's timezone.
// Year-month-day sorts correctly as plain text, and it's how the day notes
// table stores the day.
export function dayKey(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Checks a day sent by the browser before it's saved with a note.
export function isDayKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

// The last `count` days ending today, newest first. Steps back from noon by
// calendar day rather than by 24 hours, so a daylight saving change can't
// skip or repeat a day.
export function recentDays(now: number, count: number): string[] {
  const today = new Date(now);
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  const days: string[] = [];
  for (let i = 0; i < count; i++) {
    days.push(dayKey(d.getTime()));
    d.setDate(d.getDate() - 1);
  }
  return days;
}

// The games grouped by day, newest day first. Days with no games are left
// out; the month strip shows those.
export function groupDays(games: LogGame[], ranks: LogRankPoint[]): LogDay[] {
  const byDay = new Map<string, LogGame[]>();
  for (const game of [...games].sort((a, b) => b.startedAt - a.startedAt)) {
    const day = dayKey(game.startedAt);
    byDay.set(day, [...(byDay.get(day) ?? []), game]);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([day, dayGames]) => {
      const wins = dayGames.filter((g) => g.win).length;
      return {
        day,
        games: dayGames,
        wins,
        losses: dayGames.length - wins,
        ranked: dayGames.filter((g) => g.ranked).length,
        lp: dayLp(dayGames, ranks),
      };
    });
}

// LP gained or lost in a day's solo/duo games. Riot only says what a
// player's rank is right now, so this compares two saved copies of the rank:
// the last one before the day's first ranked game and the first one after its
// last. That's only the day's LP if exactly the day's ranked games happened
// in between, which the saved win and loss counts tell us. Otherwise (the
// profile wasn't updated that day, or not until after more games) it's null,
// and the card says "LP not recorded" instead of guessing.
export function dayLp(games: LogGame[], ranks: LogRankPoint[]): number | null {
  const ranked = games.filter((g) => g.ranked);
  if (ranked.length === 0) return null;
  const first = Math.min(...ranked.map((g) => g.startedAt));
  const last = Math.max(...ranked.map((g) => g.startedAt));
  const sorted = [...ranks].sort((a, b) => a.at - b.at);
  const before = sorted.filter((p) => p.at < first).at(-1);
  const after = sorted.find((p) => p.at > last);
  if (!before || !after || after.games - before.games !== ranked.length) return null;
  return after.score - before.score;
}

// The day's averages for the Detailed cards. Null where no game has the
// number (no scored games, or no timelines fetched yet).
export type DayStats = {
  champions: { label: string; games: number }[]; // most played first
  score: number | null;
  csPerMin: number;
  deaths: number;
  visionPerMin: number;
  goldAt15: number | null;
};

export function dayStats(games: LogGame[]): DayStats {
  const counts = new Map<string, number>();
  for (const g of games) counts.set(g.championLabel, (counts.get(g.championLabel) ?? 0) + 1);
  return {
    champions: [...counts.entries()]
      .map(([label, n]) => ({ label, games: n }))
      .sort((a, b) => b.games - a.games),
    score: average(games.map((g) => g.score)),
    csPerMin: average(games.map((g) => g.csPerMin)) ?? 0,
    deaths: average(games.map((g) => g.deaths)) ?? 0,
    visionPerMin: average(games.map((g) => g.visionPerMin)) ?? 0,
    goldAt15: average(games.map((g) => g.goldAt15)),
  };
}

function average(values: (number | null)[]): number | null {
  const known = values.filter((v): v is number => v !== null);
  return known.length ? known.reduce((sum, v) => sum + v, 0) / known.length : null;
}

// How each of the day's games went against the focus goal, oldest first:
// true = avoided the weakness, false = it showed, null = can't tell yet.
// Only games after the goal was picked count, like the Insights panel.
export function focusResults(games: LogGame[], focus: Focus): (boolean | null)[] {
  return games
    .filter((g) => g.startedAt > focus.setAt)
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((g) => {
      const shows = g.shows?.[focus.id];
      return shows === undefined || shows === null ? null : !shows;
    });
}

// One square in the month strip at the top of the Log tab.
export type StripDay = { day: string; games: number; wins: number; losses: number };

// The last LOG_DAYS days, oldest first so the strip reads left to right.
export function monthStrip(days: LogDay[], now: number): StripDay[] {
  const byDay = new Map(days.map((d) => [d.day, d]));
  return recentDays(now, LOG_DAYS)
    .reverse()
    .map((day) => {
      const found = byDay.get(day);
      return {
        day,
        games: found?.games.length ?? 0,
        wins: found?.wins ?? 0,
        losses: found?.losses ?? 0,
      };
    });
}

// "Today", "Yesterday" or "3 days ago", under the date on each card.
export function daysAgo(day: string, now: number): string {
  const index = recentDays(now, LOG_DAYS + 7).indexOf(day);
  if (index === 0) return "Today";
  if (index === 1) return "Yesterday";
  return index > 1 ? `${index} days ago` : "";
}
