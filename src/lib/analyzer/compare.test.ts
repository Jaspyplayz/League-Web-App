import { describe, expect, it } from "vitest";
import { compareWithBenchmarks, MIN_BENCHMARK_GAMES, type BenchmarkGame } from "./compare";
import type { GameTrend } from "./trends";

function game(overrides: Partial<GameTrend> = {}): GameTrend {
  return {
    matchId: "NA1_1",
    startedAt: 0,
    win: true,
    championName: "LeeSin",
    position: "JUNGLE",
    goldAt10: 0,
    csAt10: 0,
    goldAt15: 0,
    earlyDeaths: [],
    csPerMin: { early: 5, mid: 5, late: null },
    ...overrides,
  };
}

// `count` benchmark games by one player, a minute apart.
function bench(puuid: string, count: number, overrides: Partial<BenchmarkGame> = {}) {
  return Array.from({ length: count }, (_, i): BenchmarkGame => ({
    puuid,
    startedAt: i * 60_000,
    win: true,
    championName: "LeeSin",
    position: "JUNGLE",
    goldAt10: 0,
    csAt10: 0,
    goldAt15: 0,
    earlyDeaths: [],
    csPerMin: { early: 5, mid: 5, late: null },
    ...overrides,
  }));
}

const CLASSES: Record<string, string> = {
  LeeSin: "Fighter",
  Vi: "Fighter",
  Elise: "Mage",
  Ahri: "Mage",
};
const classOf = (name: string) => CLASSES[name] ?? null;

describe("compareWithBenchmarks", () => {
  it("prefers one-tricks on your champion", () => {
    const benchmarks = [
      // A Lee Sin one-trick: 15 of their 20 games.
      ...bench("otp", 15, { goldAt10: 600 }),
      ...bench("otp", 5, { championName: "Vi", goldAt10: 0 }),
      // Someone who plays Lee Sin sometimes.
      ...bench("flex", 6, { goldAt10: -400 }),
      ...bench("flex", 14, { championName: "Elise", goldAt10: -400 }),
    ];
    const result = compareWithBenchmarks([game({ goldAt10: 100 })], benchmarks, classOf)!;
    const [lee] = result.champions;
    expect(lee.level).toBe("one-trick");
    expect(lee.sample).toEqual({ games: 15, players: 1 });
    expect(result.stats.find((s) => s.key === "goldAt10")).toEqual({
      key: "goldAt10",
      you: 100,
      them: 600,
      games: 1,
    });
  });

  it("falls back to everyone on your champion, then your champion's class, then your role", () => {
    const flex = (puuid: string, championName: string, count: number) =>
      bench(puuid, count, { championName });
    // Nobody one-tricks anything here: everyone splits their games.
    const benchmarks = [
      ...flex("a", "LeeSin", 6),
      ...flex("a", "Elise", 6),
      ...flex("b", "LeeSin", 6),
      ...flex("b", "Elise", 6),
      ...flex("c", "Vi", 4),
      ...flex("c", "Elise", 4),
    ];
    const result = compareWithBenchmarks(
      [
        game({ championName: "LeeSin" }), // 12 Lee Sin games: enough on its own
        game({ championName: "Vi" }), // 4 Vi games, but 16 Fighter games
        game({ championName: "Nidalee" }), // unknown class: whole role
      ],
      benchmarks,
      classOf,
    )!;
    const levels = Object.fromEntries(result.champions.map((c) => [c.championName, c.level]));
    expect(levels).toEqual({ LeeSin: "champion", Vi: "class", Nidalee: "role" });
    expect(result.compared).toBe(3);
  });

  it("only compares with the same role", () => {
    const benchmarks = bench("mid", 20, { championName: "Ahri", position: "MIDDLE" });
    expect(compareWithBenchmarks([game()], benchmarks, classOf)).toBeNull();
  });

  it("leaves a champion uncompared when no group is big enough", () => {
    const benchmarks = [
      ...bench("a", MIN_BENCHMARK_GAMES, { position: "TOP", championName: "Gnar" }),
      ...bench("b", MIN_BENCHMARK_GAMES - 1),
    ];
    const result = compareWithBenchmarks(
      [game(), game({ position: "TOP", championName: "Gnar" })],
      benchmarks,
      classOf,
    )!;
    expect(result.compared).toBe(1);
    expect(result.champions.find((c) => c.championName === "LeeSin")?.level).toBeNull();
  });

  it("averages per game, so each game uses its own champion's benchmark", () => {
    const benchmarks = [
      ...bench("lee", 20, { csPerMin: { early: 6, mid: 6, late: null } }),
      ...bench("vi", 20, { championName: "Vi", csPerMin: { early: 4, mid: 4, late: null } }),
    ];
    const result = compareWithBenchmarks(
      [
        game({ csPerMin: { early: 5, mid: 5, late: null } }),
        game({ championName: "Vi", csPerMin: { early: 5, mid: 5, late: null } }),
      ],
      benchmarks,
      classOf,
    )!;
    // Both are one-tricks. The benchmark is (6 + 4) / 2 = 5, the same as you.
    expect(result.stats.find((s) => s.key === "csPerMinEarly")).toMatchObject({
      you: 5,
      them: 5,
      games: 2,
    });
  });

  it("leaves support games out of CS stats", () => {
    const support = { position: "UTILITY", championName: "Thresh" };
    const result = compareWithBenchmarks(
      [game({ ...support, earlyDeaths: ["gank", "gank"] })],
      bench("t", 20, { ...support, earlyDeaths: ["gank"] }),
      classOf,
    )!;
    const keys = result.stats.map((s) => s.key);
    expect(keys).toEqual(["goldAt10", "goldAt15", "earlyDeaths"]);
    expect(result.stats.find((s) => s.key === "earlyDeaths")).toMatchObject({ you: 2, them: 1 });
  });

  it("skips stats a game didn't reach", () => {
    const result = compareWithBenchmarks(
      [game({ goldAt15: null })],
      bench("lee", 20, { goldAt15: 300 }),
      classOf,
    )!;
    expect(result.stats.map((s) => s.key)).not.toContain("goldAt15");
  });
});
