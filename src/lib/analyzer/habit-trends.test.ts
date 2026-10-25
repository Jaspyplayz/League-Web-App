import { describe, expect, it } from "vitest";
import type { Habits } from "./habits";
import { compareHabits, habitLabel } from "./habit-trends";

const NONE: Habits = {
  level6First: null,
  firstScuttleLead: null,
  firstGankS: null,
  firstBackS: null,
};

function game(win: boolean, habits: Partial<Habits> | null, position = "JUNGLE") {
  return { win, position, habits: habits && { ...NONE, ...habits } };
}

// n copies of a game.
const times = <T>(n: number, g: T): T[] => Array.from({ length: n }, () => g);

describe("compareHabits", () => {
  it("splits your games by each habit and counts the wins", () => {
    const yours = [
      game(true, { level6First: true }),
      game(true, { level6First: true }),
      game(false, { level6First: true }),
      game(false, { level6First: false }),
    ];
    const report = compareHabits(yours, [])!;
    const level6 = report.habits.find((h) => h.id === "level-6-first")!;
    expect(level6.you).toEqual({ with: { games: 3, wins: 2 }, without: { games: 1, wins: 0 } });
    expect(level6.rank).toBeNull();
  });

  it("is about the role you played most, and leaves jungle habits out for other roles", () => {
    const yours = [
      ...times(3, game(true, { level6First: true, firstBackS: 300 }, "MIDDLE")),
      game(true, { level6First: true, firstScuttleLead: 1 }, "JUNGLE"),
    ];
    const report = compareHabits(yours, [])!;
    expect(report.position).toBe("MIDDLE");
    expect(report.games).toBe(3);
    expect(report.habits.map((h) => h.id)).toEqual(["level-6-first", "early-back"]);
  });

  it("counts a jungler with no lane takedown before 14:00 as no early gank", () => {
    const yours = [
      game(true, { firstGankS: 250 }),
      game(false, { firstGankS: 500 }),
      game(false, { firstGankS: null }),
    ];
    const gank = compareHabits(yours, [])!.habits.find((h) => h.id === "early-gank")!;
    expect(gank.you).toEqual({ with: { games: 1, wins: 1 }, without: { games: 2, wins: 0 } });
  });

  it("skips benchmark games saved before habits were collected", () => {
    const rank = [
      ...times(10, game(true, { firstScuttleLead: 1 })),
      ...times(30, game(false, null)),
    ];
    const yours = times(3, game(true, { firstScuttleLead: 0 }));
    const report = compareHabits(yours, rank)!;
    expect(report.rankGames).toBe(10);
    // 10 with the habit but none without, so there's no rank split to show.
    expect(report.habits.find((h) => h.id === "first-scuttles")!.rank).toBeNull();
  });

  it("compares with the rank once it has enough games on both sides", () => {
    const rank = [
      ...times(12, game(true, { firstScuttleLead: 2 })),
      ...times(10, game(false, { firstScuttleLead: 0 })),
    ];
    const yours = times(3, game(true, { firstScuttleLead: 1 }));
    const scuttles = compareHabits(yours, rank)!.habits.find((h) => h.id === "first-scuttles")!;
    expect(scuttles.rank).toEqual({
      with: { games: 12, wins: 12 },
      without: { games: 10, wins: 0 },
    });
  });

  it("splits first backs at the rank's usual time, or yours without enough rank games", () => {
    const yours = [
      game(true, { firstBackS: 200 }),
      game(true, { firstBackS: 300 }),
      game(false, { firstBackS: 400 }),
    ];
    const mine = compareHabits(yours, [])!;
    expect(mine).toMatchObject({ backBy: 300, backFrom: "you" });
    expect(mine.habits.find((h) => h.id === "early-back")!.you.with).toEqual({ games: 1, wins: 1 });

    const rank = [
      ...times(10, game(true, { firstBackS: 250 })),
      ...times(10, game(false, { firstBackS: 450 })),
    ];
    const theirs = compareHabits(yours, rank)!;
    expect(theirs).toMatchObject({ backBy: 350, backFrom: "rank" });
    expect(theirs.habits.find((h) => h.id === "early-back")!.you.with).toEqual({
      games: 2,
      wins: 2,
    });
  });

  it("is null with no games", () => {
    expect(compareHabits([], [])).toBeNull();
  });
});

describe("habitLabel", () => {
  it("names each habit the way its card does", () => {
    expect(habitLabel("level-6-first")).toBe("Level 6 first");
    expect(habitLabel("first-scuttles")).toBe("First scuttles");
    expect(habitLabel("early-gank")).toBe("Lane takedown before 6:00");
    expect(habitLabel("early-back", 310)).toBe("First back before 5:10");
  });
});
