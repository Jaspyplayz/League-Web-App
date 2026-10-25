import { describe, expect, it } from "vitest";
import type { StatComparison, StatKey } from "./compare";
import type { HabitId, HabitReport, HabitResult, HabitSplit } from "./habit-trends";
import { isRankHabit, skillToImprove, statRowStyle, type SkillFocus } from "./skill";

function stat(key: StatKey, you: number, them: number, games: number): StatComparison {
  return { key, you, them, games };
}

function split(withGames: number, withoutGames: number): HabitSplit {
  return {
    with: { games: withGames, wins: 0 },
    without: { games: withoutGames, wins: 0 },
  };
}

function habit(id: HabitId, you: HabitSplit, rank: HabitSplit | null): HabitResult {
  return { id, you, rank };
}

function report(habits: HabitResult[], position = "MIDDLE"): HabitReport {
  return {
    position,
    games: 11,
    rankGames: 100,
    backBy: 330,
    backFrom: "rank",
    habits,
  };
}

function behind(focus: SkillFocus | null) {
  expect(focus?.status).toBe("behind");
  if (focus?.status !== "behind") throw new Error("expected a skill behind the rank");
  return focus;
}

const GOLD_12 =
  "Your gold lead at 10 is 800 behind Diamond across 12 games. That number is a lead over each player's own lane opponent.";

describe("skillToImprove", () => {
  it("picks gold at 10 over a smaller death gap", () => {
    const focus = behind(
      skillToImprove(
        [stat("earlyDeaths", 2, 1, 12), stat("goldAt10", 0, 800, 12)],
        null,
        "Diamond",
      ),
    );
    expect(focus).toEqual({
      status: "behind",
      id: { kind: "stat", key: "goldAt10" },
      label: "Gold lead at 10",
      sentence: GOLD_12,
      youText: "0",
      rankText: "+800",
      rankName: "Diamond",
      gap: { text: "800 behind", tone: "worse" },
      track: { you: 0, rank: 1, zero: null },
      games: 12,
    });
  });

  it("marks zero on a lead that crosses even", () => {
    const focus = behind(
      skillToImprove([stat("goldAt10", -200, 200, 12)], null, "Diamond"),
    );
    expect(focus.track).toEqual({ you: 0, rank: 1, zero: 0.5 });
    expect(focus.youText).toBe("−200");
    expect(focus.rankText).toBe("+200");
    expect(focus.sentence).toBe(
      "Your gold lead at 10 is 400 behind Diamond across 12 games. That number is a lead over each player's own lane opponent.",
    );
  });

  it("returns null when the only stat is time in the enemy half", () => {
    expect(skillToImprove([stat("enemyHalf", 0.2, 0.8, 20)], null, "Diamond")).toBeNull();
  });

  it("returns null when the only worse habit is the first back", () => {
    const earlyBack = report([
      habit("early-back", split(1, 9), split(15, 5)),
    ]);
    expect(skillToImprove(null, earlyBack, "Diamond")).toBeNull();
  });

  it("returns null with nothing to grade", () => {
    expect(skillToImprove(null, null, "Diamond")).toBeNull();
  });

  it("says you are ahead when every graded skill is ahead", () => {
    expect(skillToImprove([stat("csPerMinEarly", 8, 6, 10)], null, "Diamond")).toEqual({
      status: "level",
      sentence: "You are ahead of Diamond on every skill that had enough games.",
    });
  });

  it("says you are level when every graded skill is even", () => {
    expect(skillToImprove([stat("goldAt10", 100, 100, 9)], null, "Diamond")).toEqual({
      status: "level",
      sentence: "You are level with Diamond on every skill that had enough games.",
    });
  });

  it("names both even and ahead skills when neither is worse", () => {
    expect(
      skillToImprove(
        [stat("goldAt10", 100, 100, 9), stat("csPerMinEarly", 8, 6, 10)],
        null,
        "Diamond",
      ),
    ).toEqual({
      status: "level",
      sentence:
        "You are level with Diamond on some skills that had enough games, and ahead on the others.",
    });
  });

  it("picks level 6 first when no stat is worse", () => {
    const focus = behind(
      skillToImprove(
        [stat("goldAt10", 500, 100, 12)],
        report([habit("level-6-first", split(4, 7), split(62, 38))]),
        "Diamond",
      ),
    );
    expect(focus).toEqual({
      status: "behind",
      id: { kind: "habit", id: "level-6-first" },
      label: "Level 6 first",
      sentence:
        "You hit level 6 first in 4 of 11 mid games. Diamond did in 62 of 100 games. These are patterns across games, not advice for any one of them.",
      youText: "36%",
      rankText: "62%",
      rankName: "Diamond",
      gap: { text: "26% behind", tone: "worse" },
      track: { you: 4 / 11, rank: 62 / 100, zero: null },
      games: 11,
    });
  });

  it("lets the earlier gold row win the same rounded gap", () => {
    const focus = behind(
      skillToImprove(
        [stat("goldAt15", 0, 400, 10), stat("goldAt10", 0, 400, 10)],
        null,
        "Diamond",
      ),
    );
    expect(focus.id).toEqual({ kind: "stat", key: "goldAt10" });
    expect(focus.label).toBe("Gold lead at 10");
  });

  it("adds a rough read under 8 games, then the lead clause", () => {
    const focus = behind(skillToImprove([stat("goldAt10", 0, 800, 7)], null, "Diamond"));
    expect(focus.sentence).toBe(
      "Your gold lead at 10 is 800 behind Diamond across 7 games. That's 7 games, so it's a rough read. That number is a lead over each player's own lane opponent.",
    );
  });

  it("uses are and than for deaths", () => {
    const focus = behind(skillToImprove([stat("earlyDeaths", 3, 1, 12)], null, "Diamond"));
    expect(focus.sentence).toBe(
      "Your deaths before 14:00 are 2.0 more than Diamond across 12 games.",
    );
    expect(focus.youText).toBe("3.0");
    expect(focus.rankText).toBe("1.0");
    expect(focus.gap).toEqual({ text: "2.0 more", tone: "worse" });
    expect(focus.track).toEqual({ you: 1, rank: 1 / 3, zero: null });
  });

  it("uses the rank name it was given", () => {
    expect(skillToImprove([stat("csPerMinEarly", 8, 6, 10)], null, "Gold")).toEqual({
      status: "level",
      sentence: "You are ahead of Gold on every skill that had enough games.",
    });
  });

  it("skips a stat that is not a real number", () => {
    const focus = behind(
      skillToImprove(
        [stat("goldAt10", Number.NaN, 800, 12), stat("earlyDeaths", 3, 1, 12)],
        null,
        "Diamond",
      ),
    );
    expect(focus.id).toEqual({ kind: "stat", key: "earlyDeaths" });
  });

  it("returns null when every number is missing", () => {
    expect(skillToImprove([stat("goldAt10", Number.NaN, 800, 12)], null, "Diamond")).toBeNull();
  });

  it("skips a habit with no rank split or no known games", () => {
    expect(
      skillToImprove(null, report([habit("level-6-first", split(4, 7), null)]), "Diamond"),
    ).toBeNull();
    expect(
      skillToImprove(
        null,
        report([habit("level-6-first", split(0, 0), split(10, 10))]),
        "Diamond",
      ),
    ).toBeNull();
    expect(
      skillToImprove(
        null,
        report([habit("level-6-first", split(4, 7), split(0, 0))]),
        "Diamond",
      ),
    ).toBeNull();
  });

  it("says an early gank was before 6:00 and names the role", () => {
    const focus = behind(
      skillToImprove(
        null,
        report([habit("early-gank", split(2, 8), split(8, 2))], "JUNGLE"),
        "Diamond",
      ),
    );
    expect(focus.label).toBe("Lane takedown before 6:00");
    expect(focus.sentence).toBe(
      "You had a kill or assist in a lane before 6:00 in 2 of 10 jungle games. Diamond did in 8 of 10 games. These are patterns across games, not advice for any one of them.",
    );
  });

  it("adds the rough read before the habit pattern note", () => {
    const focus = behind(
      skillToImprove(
        null,
        report([habit("level-6-first", split(2, 3), split(50, 50))]),
        "Diamond",
      ),
    );
    expect(focus.sentence).toBe(
      "You hit level 6 first in 2 of 5 mid games. Diamond did in 50 of 100 games. That's 5 games, so it's a rough read. These are patterns across games, not advice for any one of them.",
    );
    expect(focus.games).toBe(5);
  });

  it("describes the first scuttles in the rank's games", () => {
    const focus = behind(
      skillToImprove(
        null,
        report([habit("first-scuttles", split(3, 7), split(7, 3))], "JUNGLE"),
        "Diamond",
      ),
    );
    expect(focus.label).toBe("First scuttles");
    expect(focus.sentence).toBe(
      "You took more of the two 3:30 scuttle crabs than the enemy jungler in 3 of 10 jungle games. Diamond did in 7 of 10 games. These are patterns across games, not advice for any one of them.",
    );
  });

  it("uses game when the position has no name", () => {
    const focus = behind(
      skillToImprove(
        null,
        report([habit("level-6-first", split(4, 7), split(62, 38))], "UNKNOWN"),
        "Diamond",
      ),
    );
    expect(focus.sentence).toBe(
      "You hit level 6 first in 4 of 11 games. Diamond did in 62 of 100 games. These are patterns across games, not advice for any one of them.",
    );
  });
});

describe("statRowStyle", () => {
  it("shares the table label with the sentence and leaves enemy half ungraded", () => {
    const gold = statRowStyle("goldAt10");
    expect(gold.label).toBe("Gold lead at 10");
    expect(gold.format(800)).toBe("+800");
    expect(gold.format(-200)).toBe("−200");
    expect(gold.gap).toEqual({ decimals: 0 });

    const deaths = statRowStyle("earlyDeaths");
    expect(deaths.label).toBe("Deaths before 14:00");
    expect(deaths.format(3)).toBe("3.0");
    expect(deaths.gap).toEqual({ decimals: 1, lowerIsBetter: true });

    expect(statRowStyle("csPerMinEarly").label).toBe("CS/min, 0 to 10");
    expect(statRowStyle("csPerMinMid").label).toBe("CS/min, 10 to 20");
    expect(statRowStyle("visionPerMin").format(1.2)).toBe("1.20");
    expect(statRowStyle("strongerSide").format(0.57)).toBe("57%");

    const enemyHalf = statRowStyle("enemyHalf");
    expect(enemyHalf.label).toBe("Minutes in the enemy half, 3 to 15");
    expect(enemyHalf.gap).toEqual({
      decimals: 2,
      format: enemyHalf.gap.format,
      neutral: true,
    });
    expect(enemyHalf.gap.format?.(0.2)).toBe("20%");
  });
});

describe("isRankHabit", () => {
  it("keeps early back out of the rank comparison", () => {
    expect(isRankHabit("early-back")).toBe(false);
    expect(isRankHabit("level-6-first")).toBe(true);
    expect(isRankHabit("first-scuttles")).toBe(true);
    expect(isRankHabit("early-gank")).toBe(true);
  });
});
