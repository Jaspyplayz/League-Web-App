import { describe, expect, it } from "vitest";
import type { WeaknessId } from "./analyzer/trends";
import {
  dayKey,
  dayLp,
  dayStats,
  daysAgo,
  focusResults,
  groupDays,
  isDayKey,
  LOG_DAYS,
  monthStrip,
  recentDays,
  type LogGame,
  type LogRankPoint,
} from "./daily-log";

// Times are built in this computer's own timezone, like the browser does,
// so the tests pass wherever they run.
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();
const NOW = at(16, 20);

function game(startedAt: number, extra: Partial<LogGame> = {}): LogGame {
  return {
    matchId: `NA1_${startedAt}`,
    startedAt,
    win: true,
    ranked: true,
    championName: "Viego",
    championLabel: "Viego",
    kills: 5,
    deaths: 3,
    assists: 7,
    csPerMin: 6,
    visionPerMin: 1,
    score: 60,
    goldAt15: null,
    shows: null,
    ...extra,
  };
}

const rank = (when: number, score: number, games: number): LogRankPoint => ({
  at: when,
  score,
  games,
});

describe("dayKey and recentDays", () => {
  it("names a day year-month-day in local time", () => {
    expect(dayKey(at(16, 0, 5))).toBe("2026-10-16");
    expect(dayKey(at(16, 23, 55))).toBe("2026-10-16");
    expect(dayKey(at(3, 12))).toBe("2026-10-03");
  });

  it("lists days back from today, across a month boundary", () => {
    const days = recentDays(at(2, 1), 4);
    expect(days).toEqual(["2026-10-02", "2026-10-01", "2026-09-30", "2026-09-29"]);
  });

  it("checks days sent by the browser", () => {
    expect(isDayKey("2026-10-16")).toBe(true);
    expect(isDayKey("2026-02-30")).toBe(false);
    expect(isDayKey("2026-10-16; drop table")).toBe(false);
    expect(isDayKey(20261016)).toBe(false);
  });

  it("says how long ago a day was", () => {
    expect(daysAgo("2026-10-16", NOW)).toBe("Today");
    expect(daysAgo("2026-10-15", NOW)).toBe("Yesterday");
    expect(daysAgo("2026-10-13", NOW)).toBe("3 days ago");
  });
});

describe("groupDays", () => {
  it("groups games by day, newest day and game first", () => {
    const days = groupDays(
      [game(at(15, 18)), game(at(16, 14), { win: false }), game(at(16, 19)), game(at(13, 10))],
      [],
    );
    expect(days.map((d) => d.day)).toEqual(["2026-10-16", "2026-10-15", "2026-10-13"]);
    expect(days[0].games.map((g) => g.startedAt)).toEqual([at(16, 19), at(16, 14)]);
    expect(days[0]).toMatchObject({ wins: 1, losses: 1, ranked: 2 });
  });
});

describe("dayLp", () => {
  const games = [game(at(16, 14)), game(at(16, 15)), game(at(16, 16), { win: false })];

  it("compares the saved ranks either side of the day's ranked games", () => {
    const ranks = [rank(at(15, 9), 2800, 100), rank(at(16, 18), 2838, 103)];
    expect(dayLp(games, ranks)).toBe(38);
  });

  it("works for LP lost, and ignores copies saved between the games", () => {
    const ranks = [rank(at(15, 9), 2800, 100), rank(at(16, 14, 30), 2820, 101), rank(at(17, 9), 2781, 103)];
    expect(dayLp(games, ranks)).toBe(-19);
  });

  it("is null when no rank was saved after the day's games", () => {
    expect(dayLp(games, [rank(at(15, 9), 2800, 100)])).toBeNull();
  });

  it("is null when other ranked games happened before the next saved rank", () => {
    const ranks = [rank(at(15, 9), 2800, 100), rank(at(18, 9), 2860, 107)];
    expect(dayLp(games, ranks)).toBeNull();
  });

  it("is null on a day with no ranked games", () => {
    const ranks = [rank(at(15, 9), 2800, 100), rank(at(16, 18), 2800, 100)];
    expect(dayLp([game(at(16, 14), { ranked: false })], ranks)).toBeNull();
  });
});

describe("dayStats", () => {
  it("averages the day and counts champions", () => {
    const stats = dayStats([
      game(at(16, 14), { championLabel: "Lee Sin", score: 80, deaths: 2, goldAt15: 300 }),
      game(at(16, 15), { score: null, deaths: 4 }),
      game(at(16, 16), { championLabel: "Lee Sin", score: 40, deaths: 6, goldAt15: -100 }),
    ]);
    expect(stats.champions).toEqual([
      { label: "Lee Sin", games: 2 },
      { label: "Viego", games: 1 },
    ]);
    expect(stats.score).toBe(60);
    expect(stats.deaths).toBe(4);
    expect(stats.goldAt15).toBe(100);
  });

  it("leaves gold at 15 empty when no timeline is in yet", () => {
    expect(dayStats([game(at(16, 14))]).goldAt15).toBeNull();
  });
});

describe("focusResults", () => {
  const shows = (behind: boolean | null) =>
    ({ "behind-at-10": behind }) as Record<WeaknessId, boolean | null>;

  it("marks games after the goal was picked, oldest first", () => {
    const games = [
      game(at(16, 18), { shows: shows(true) }),
      game(at(16, 14), { shows: shows(false) }),
      game(at(16, 16), { shows: null }),
      game(at(16, 9), { shows: shows(false) }),
    ];
    expect(focusResults(games, { id: "behind-at-10", setAt: at(16, 10) })).toEqual([
      true,
      null,
      false,
    ]);
  });
});

describe("monthStrip", () => {
  it("has one square per day, oldest first, ending today", () => {
    const strip = monthStrip(groupDays([game(at(16, 14)), game(at(14, 14), { win: false })], []), NOW);
    expect(strip).toHaveLength(LOG_DAYS);
    expect(strip.at(-1)).toEqual({ day: "2026-10-16", games: 1, wins: 1, losses: 0 });
    expect(strip.at(-3)).toEqual({ day: "2026-10-14", games: 1, wins: 0, losses: 1 });
    expect(strip.at(-2)?.games).toBe(0);
  });
});
