import { describe, expect, it } from "vitest";
import type { WeaknessId } from "./analyzer/trends";
import {
  dayColour,
  dayKey,
  dayLp,
  daysAgo,
  focusResults,
  formatDay,
  formatMonth,
  groupDays,
  isDayKey,
  monthGrid,
  monthsInRange,
  recentDays,
  startMonth,
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
    championLabel: "Viego",
    championIcon: null,
    kills: 5,
    deaths: 3,
    assists: 7,
    score: 60,
    recap: null,
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

describe("dayColour", () => {
  it("is blue when most of the day's games were won", () => {
    expect(dayColour({ wins: 2, losses: 1 })).toBe("won");
  });

  it("is red when most were lost", () => {
    expect(dayColour({ wins: 1, losses: 3 })).toBe("lost");
  });

  it("is neither on a tie", () => {
    expect(dayColour({ wins: 2, losses: 2 })).toBe("even");
  });

  it("is the plain fill on a day with no games", () => {
    expect(dayColour(undefined)).toBe("none");
    expect(dayColour({ wins: 0, losses: 0 })).toBe("none");
  });
});

describe("monthGrid", () => {
  const days = groupDays(
    [
      game(at(16, 14)),
      game(at(16, 15), { win: false }),
      game(at(14, 14), { win: false }),
      game(at(13, 14)),
    ],
    [],
  );
  const grid = monthGrid("2026-10", days, NOW);

  it("has every day of the month, starting on the right weekday", () => {
    expect(grid).toHaveLength(31);
    // 1 October 2026 is a Thursday: the fourth column when weeks start on Monday.
    expect(grid[0]).toMatchObject({ day: "2026-10-01", date: 1, weekday: 3 });
    expect(grid[4]).toMatchObject({ date: 5, weekday: 0 });
    expect(grid[30].day).toBe("2026-10-31");
  });

  it("colours each day by its games and marks today", () => {
    expect(grid[15]).toMatchObject({ colour: "even", today: true, wins: 1, losses: 1 });
    expect(grid[13].colour).toBe("lost");
    expect(grid[12].colour).toBe("won");
    expect(grid[14]).toMatchObject({ colour: "none", today: false });
  });

  it("marks only the last four weeks as in range", () => {
    // Four weeks back from 16 October is 19 September, so all of October up
    // to today is in range and the days after it aren't.
    expect(grid[0].inRange).toBe(true);
    expect(grid[15].inRange).toBe(true);
    expect(grid[16].inRange).toBe(false);
    const september = monthGrid("2026-09", days, NOW);
    expect(september).toHaveLength(30);
    expect(september[17].inRange).toBe(false); // 18 September
    expect(september[18].inRange).toBe(true); // 19 September
  });

  it("starts February 2027 on a Monday and gives it 28 days", () => {
    const feb = monthGrid("2027-02", [], at(16, 20));
    expect(feb).toHaveLength(28);
    expect(feb[0].weekday).toBe(0);
  });
});

describe("months", () => {
  it("lists the one or two months the last four weeks touch, oldest first", () => {
    expect(monthsInRange(NOW)).toEqual(["2026-09", "2026-10"]);
    expect(monthsInRange(at(31, 12))).toEqual(["2026-10"]);
  });

  it("opens on the newest game's month, or this month with no games", () => {
    const days = groupDays([game(new Date(2026, 8, 28, 14).getTime())], []);
    expect(startMonth(days, at(2, 12))).toBe("2026-09");
    expect(startMonth([], at(2, 12))).toBe("2026-10");
  });

  it("writes dates the way the day panels show them", () => {
    expect(formatDay("2026-10-17")).toBe("Sat 17 Oct");
    expect(formatDay("2026-09-03")).toBe("Thu 3 Sep");
    expect(formatMonth("2026-10")).toBe("October 2026");
  });
});
