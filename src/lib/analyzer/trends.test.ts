import { describe, expect, it } from "vitest";
import { frames, kill, match, participants, SPOTS } from "./test-fixtures";
import { computeTrends, csByPhase, isTrendGame, summarizeGame, type GameTrend } from "./trends";

// A made-up game summary; tests override only the fields they care about.
function game(overrides: Partial<GameTrend> = {}, i = 0): GameTrend {
  return {
    matchId: `NA1_${i}`,
    startedAt: i,
    win: true,
    championName: "Ahri",
    position: "MIDDLE",
    goldAt10: 100,
    csAt10: 5,
    goldAt15: 200,
    earlyDeaths: [],
    csPerMin: { early: 8, mid: 8, late: 8 },
    ...overrides,
  };
}

// The same game n times, with different start times.
function many(n: number, overrides: Partial<GameTrend> = {}): GameTrend[] {
  return Array.from({ length: n }, (_, i) => game(overrides, i));
}

describe("summarizeGame", () => {
  // Ahri (blue mid, participant 3) loses 100 gold and 1 CS a minute to
  // Syndra (8), farming 8 CS a minute for 20 minutes and then 4 a minute.
  const timeline = {
    frames: frames(30, (minute, id) => ({
      gold: minute * (id === 3 ? 300 : 400),
      cs: id === 3 ? (minute <= 20 ? minute * 8 : 160 + (minute - 20) * 4) : minute * 9,
    })),
    events: [kill("8:10", 7, 3, [8], SPOTS.midLane), kill("25:00", 8, 3)],
  };
  const summary = summarizeGame(match(), timeline, "player-3")!;

  it("compares you with your opponent at 10 and 15 minutes", () => {
    expect(summary.goldAt10).toBe(-1000);
    expect(summary.csAt10).toBe(-10);
    expect(summary.goldAt15).toBe(-1500);
    expect(summary.position).toBe("MIDDLE");
    expect(summary.win).toBe(false);
  });

  it("keeps only deaths before 14:00", () => {
    expect(summary.earlyDeaths).toEqual(["gank"]);
  });

  it("splits CS per minute into phases", () => {
    // The last frame of frames(30) is minute 30, so it's the end of the game.
    expect(summary.csPerMin).toEqual({ early: 8, mid: 8, late: 4 });
  });

  it("skips remakes and games without an opponent in your role", () => {
    expect(summarizeGame(match(participants(), 300), timeline, "player-3")).toBeNull();
    const aram = participants().map((p) => ({ ...p, teamPosition: "", individualPosition: "" }));
    expect(isTrendGame(match(aram), "player-3")).toBe(false);
  });
});

describe("csByPhase", () => {
  it("leaves out phases the game didn't reach", () => {
    const short = frames(18, (minute) => ({ cs: minute * 7 }));
    expect(csByPhase(short, 1)).toEqual({ early: 7, mid: null, late: null });
  });

  it("needs a few minutes past 20 before reporting the late game", () => {
    const justPast = frames(22, (minute) => ({ cs: minute * 7 }));
    expect(csByPhase(justPast, 1).late).toBeNull();
  });
});

describe("computeTrends", () => {
  it("counts games ahead and behind at 10, and averages", () => {
    const games = [game({ goldAt10: 300 }, 0), game({ goldAt10: -500 }, 1), game({}, 2)];
    const { laning } = computeTrends(games);
    expect(laning).toMatchObject({ games: 3, aheadInGold: 2, behindInGold: 1 });
    expect(laning.averageGold).toBeCloseTo(-100 / 3);
  });

  it("puts games oldest first", () => {
    const games = [game({}, 5), game({}, 1), game({}, 3)];
    expect(computeTrends(games).games.map((g) => g.startedAt)).toEqual([1, 3, 5]);
  });

  it("leaves supports out of CS stats", () => {
    const games = [game({ csAt10: 10 }, 0), game({ position: "UTILITY", csAt10: -40 }, 1)];
    expect(computeTrends(games).laning).toMatchObject({ csGames: 1, averageCs: 10 });
  });

  it("works out your record when ahead and when behind", () => {
    const games = [
      game({ goldAt15: 500, win: true }, 0),
      game({ goldAt15: 900, win: false }, 1),
      game({ goldAt15: -200, win: false }, 2),
    ];
    const at15 = computeTrends(games).conversion.find((c) => c.minute === 15)!;
    expect(at15.ahead).toEqual({ games: 2, wins: 1 });
    expect(at15.behind).toEqual({ games: 1, wins: 0 });
  });

  it("counts early deaths by kind, most common first", () => {
    const games = [game({ earlyDeaths: ["gank", "solo"] }, 0), game({ earlyDeaths: ["gank"] }, 1)];
    expect(computeTrends(games).earlyDeaths).toEqual({
      total: 3,
      perGame: 1.5,
      byLabel: [
        { label: "gank", count: 2 },
        { label: "solo", count: 1 },
      ],
    });
  });
});

describe("weaknesses", () => {
  const titles = (games: GameTrend[]) => computeTrends(games).weaknesses.map((w) => w.title);

  it("needs enough games before saying anything", () => {
    expect(titles(many(4, { goldAt10: -100 }))).toEqual([]);
  });

  it("finds nothing when you're doing well", () => {
    expect(titles(many(10))).toEqual([]);
  });

  it("flags being behind at 10 in most games", () => {
    const games = [...many(6, { goldAt10: -100 }), ...many(4)];
    const [weakness] = computeTrends(games).weaknesses;
    expect(weakness.title).toBe("Behind at 10 minutes");
    expect(weakness.detail).toBe(
      "You're behind your opponent in gold at 10 minutes in 6 of 10 games.",
    );
  });

  it("doesn't flag exactly half", () => {
    expect(titles([...many(5, { goldAt10: -100 }), ...many(5)])).toEqual([]);
  });

  it("flags leads that don't turn into wins", () => {
    expect(titles(many(6, { win: false }))).toEqual(["Leads slip away"]);
  });

  it("flags the most common kind of early death", () => {
    const games = many(5, { earlyDeaths: ["gank", "gank", "solo"] });
    const [weakness] = computeTrends(games).weaknesses;
    expect(weakness.title).toBe("Getting ganked early");
    expect(weakness.detail).toBe("10 of your 15 deaths before 14:00 came from ganks (67%).");
  });

  it("flags CS dropping off after the early game", () => {
    const games = many(5, { csPerMin: { early: 8, mid: 7, late: 5 } });
    expect(computeTrends(games).weaknesses[0].detail).toBe(
      "You farm 8.0 CS a minute in the first 10 minutes but 5.0 after 20 minutes.",
    );
  });

  it("shows the strongest three, strongest first", () => {
    const games = many(10, {
      goldAt10: -100,
      csAt10: -5,
      goldAt15: -100,
      win: false,
      earlyDeaths: ["gank"],
      csPerMin: { early: 8, mid: 7, late: 6.8 },
    });
    // Behind in gold and CS at 10 in 10 of 10 games and ganks making up all
    // early deaths all score 1. Never ahead at 15, and CS drops only 15%.
    expect(titles(games)).toEqual([
      "Behind at 10 minutes",
      "Losing the CS race",
      "Getting ganked early",
    ]);
  });
});
