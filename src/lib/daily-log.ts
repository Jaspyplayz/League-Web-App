import type { WeaknessId } from "@/lib/analyzer/trends";
import type { Focus } from "@/lib/focus";

// The profile's By day view (it was the Log tab): a player's games grouped
// into days, on a month calendar coloured by how each day went, with a panel
// per day (record, LP, focus goal, games) and a short private note on it. These are
// plain functions so they can be tested without a browser or a database; the
// view is src/app/player/[region]/[riotId]/by-day.tsx and daily-log.tsx.
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
  // The champion's square portrait from Data Dragon, or null when Data
  // Dragon couldn't be reached (the row then shows a plain square).
  championIcon: string | null;
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
// out; the calendar shows those.
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

// "Today", "Yesterday" or "3 days ago", under the date on each card.
export function daysAgo(day: string, now: number): string {
  const index = recentDays(now, LOG_DAYS + 7).indexOf(day);
  if (index === 0) return "Today";
  if (index === 1) return "Yesterday";
  return index > 1 ? `${index} days ago` : "";
}

// ---- The month calendar ----

// How a day went, which picks its colour on the calendar: blue when most of
// its games were won, red when most were lost, a neutral fill for a tie, and
// the plain raised fill when no games were played.
export type DayColour = "won" | "lost" | "even" | "none";

export function dayColour(day: { wins: number; losses: number } | undefined): DayColour {
  if (!day || day.wins + day.losses === 0) return "none";
  if (day.wins > day.losses) return "won";
  if (day.losses > day.wins) return "lost";
  return "even";
}

// One day on the calendar. Days before the last LOG_DAYS days, and days still
// to come, are `inRange: false`: By day has no games for them, so they get no
// fill rather than looking like days with no games.
export type CalendarDay = {
  day: string; // "2026-10-16"
  date: number; // 16
  weekday: number; // 0 for Monday to 6 for Sunday
  inRange: boolean;
  today: boolean;
  colour: DayColour;
  wins: number;
  losses: number;
};

// Every day of one month ("2026-10"), first to last. Weeks start on Monday,
// so `weekday` of the first day says which column it starts in.
export function monthGrid(month: string, days: LogDay[], now: number): CalendarDay[] {
  const [y, m] = month.split("-").map(Number);
  const byDay = new Map(days.map((d) => [d.day, d]));
  const inRange = new Set(recentDays(now, LOG_DAYS));
  const today = dayKey(now);
  // Day 0 of the next month is the last day of this one.
  const length = new Date(y, m, 0).getDate();
  return Array.from({ length }, (_, i) => {
    // Built at noon so no timezone or daylight saving change can move it.
    const date = new Date(y, m - 1, i + 1, 12);
    const day = dayKey(date.getTime());
    const found = byDay.get(day);
    return {
      day,
      date: i + 1,
      // getDay() counts from Sunday; this counts from Monday.
      weekday: (date.getDay() + 6) % 7,
      inRange: inRange.has(day),
      today: day === today,
      colour: dayColour(found),
      wins: found?.wins ?? 0,
      losses: found?.losses ?? 0,
    };
  });
}

// "2026-10" for "2026-10-16".
export function monthOf(day: string): string {
  return day.slice(0, 7);
}

// The months the last LOG_DAYS days touch, oldest first: one or two, since
// four weeks can't cover a whole month and the bits either side of it.
export function monthsInRange(now: number): string[] {
  return [...new Set(recentDays(now, LOG_DAYS).map(monthOf))].reverse();
}

// The month the calendar opens on: the newest game's, so a player who hasn't
// played yet this month still sees their last days. This month when there
// are no games at all.
export function startMonth(days: LogDay[], now: number): string {
  return monthOf(days[0]?.day ?? dayKey(now));
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// "Sat 17 Oct" from "2026-10-17", the date on each day panel. Written out by
// hand rather than with toLocaleDateString, so it reads the same in every
// browser and language setting.
export function formatDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(y, m - 1, d, 12).getDay()];
  return `${weekday} ${d} ${MONTHS[m - 1].slice(0, 3)}`;
}

// "October 2026" from "2026-10", the calendar's heading.
export function formatMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

// "October" from "2026-10", for "No games in October".
export function monthName(month: string): string {
  return MONTHS[Number(month.slice(5, 7)) - 1];
}
