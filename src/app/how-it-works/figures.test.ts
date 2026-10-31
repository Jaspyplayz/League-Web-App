import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PhaseModel } from "@/lib/analyzer/phase-score";
import type { ScoreModel } from "@/lib/analyzer/score";
import type { WinChanceModel } from "@/lib/analyzer/win-chance";
import { SCORE_MODEL } from "@/lib/game-score";
import { PHASE_MODEL } from "@/lib/phase-score";
import { WIN_CHANCE_MODEL } from "@/lib/win-chance";
import {
  checkRows,
  glanceRows,
  GOLDEN_GAMES,
  ITEM_CHECK,
  phaseRows,
  rankRows,
  riotLimit,
  weightBars,
} from "./figures";

const models = { winChance: WIN_CHANCE_MODEL, score: SCORE_MODEL, phases: PHASE_MODEL };

// A copy of a model with some numbers changed, as if it had been retrained.
// If the page typed a figure in instead of reading it, the copy's number
// wouldn't show up.
function retrained<T>(model: T, change: (copy: T) => void): T {
  const copy = structuredClone(model);
  change(copy);
  return copy;
}

describe("glanceRows", () => {
  it("has one row per trained model, in the canvas's order", () => {
    expect(glanceRows(models).map((r) => r.name)).toEqual([
      "Win chance",
      "Game score",
      "Early, mid and late ratings",
    ]);
  });

  it("reads today's figures from the model files", () => {
    const [winChance, score, phases] = glanceRows(models);
    expect(winChance.learnedFrom).toBe("18,178 ranked games, patches 16.16 to 16.20");
    expect(winChance.result).toBe(
      "Right 80% of the time at 20:00, where “more gold wins” gets 78% (both flattered; see How it’s checked)",
    );
    expect(score.learnedFrom).toBe("86 games, 860 players");
    expect(score.result).toBe("Picks the winning side 81% of the time on 35,326 later games");
    expect(phases.learnedFrom).toBe("1,923 ranked games");
    expect(phases.result).toBe("Picks the winner 62% early, 73% mid and 81% late");
  });

  it("follows a retrain", () => {
    const rows = glanceRows({
      winChance: retrained<WinChanceModel>(WIN_CHANCE_MODEL, (m) => {
        m.games = 20000;
        m.evaluation.byMinute.find((b) => b.minute === 20)!.accuracy = 0.851;
      }),
      score: retrained<ScoreModel>(SCORE_MODEL, (m) => {
        m.unseen = { games: 40000, accuracy: 0.9, checkedAt: m.unseen!.checkedAt };
      }),
      phases: retrained<PhaseModel>(PHASE_MODEL, (m) => {
        m.phases.early!.games = 2500;
        m.phases.late!.shared.accuracy = 0.84;
      }),
    });
    expect(rows[0].learnedFrom).toContain("20,000 ranked games");
    expect(rows[0].result).toContain("Right 85% of the time");
    expect(rows[1].result).toBe("Picks the winning side 90% of the time on 40,000 later games");
    expect(rows[2].learnedFrom).toBe("2,500 ranked games");
    expect(rows[2].result).toContain("84% late");
  });

  it("falls back to the training check when the game score hasn't been checked on later games", () => {
    const score = retrained<ScoreModel>(SCORE_MODEL, (m) => {
      delete m.unseen;
    });
    expect(glanceRows({ ...models, score })[1].result).toBe(
      "Picks the winning side 84% of the time in cross-validation",
    );
  });
});

describe("weightBars", () => {
  it("lists the weights that matter, biggest first, signed and scaled to the biggest", () => {
    const bars = weightBars(WIN_CHANCE_MODEL);
    expect(bars.map((b) => [b.label, b.value])).toEqual([
      ["Gold lead, per 1,000", "0.397"],
      ["Inhibitors down lead", "0.373"],
      ["Dragon lead", "0.259"],
      ["Elder buff", "0.246"],
      ["Gold lead per 1,000, times minutes / 30", "−0.206"],
      ["XP lead, per 1,000", "0.094"],
    ]);
    expect(bars[0].share).toBe(1);
    expect(bars[4].helps).toBe(false);
    expect(bars.map((b) => b.adjusts)).toEqual([false, false, false, false, true, false]);
    expect(bars[4].share).toBeCloseTo(0.2057 / 0.3969, 4);
  });
});

describe("phaseRows", () => {
  it("gives each phase's span, games, accuracy and the three stats that count most", () => {
    expect(phaseRows(PHASE_MODEL)).toEqual([
      {
        key: "early",
        name: "Early",
        span: "0 to 14:00",
        games: "1,923",
        accuracy: "62%",
        countsMost: "Gold lead, KDA, XP lead",
      },
      {
        key: "mid",
        name: "Mid",
        span: "14:00 to 25:00",
        games: "1,797",
        accuracy: "73%",
        countsMost: "KDA, XP lead, gold lead",
      },
      {
        key: "late",
        name: "Late",
        span: "25:00 to the end",
        games: "831",
        accuracy: "81%",
        countsMost: "XP lead, KDA, gold lead",
      },
    ]);
  });

  it("leaves out a phase the model has no weights for", () => {
    const model = retrained<PhaseModel>(PHASE_MODEL, (m) => {
      delete m.phases.late;
    });
    expect(phaseRows(model).map((r) => r.key)).toEqual(["early", "mid"]);
  });
});

describe("rankRows", () => {
  it("has a row for each of the 12 rank models in the file", () => {
    const rows = rankRows(WIN_CHANCE_MODEL);
    expect(rows).toHaveLength(WIN_CHANCE_MODEL.ranks.length);
    expect(rows).toHaveLength(12);
    expect(rows[0]).toEqual({
      key: "IRON",
      label: "Iron",
      games: "1,356",
      own: "81%",
      allRanks: "81%",
      lead: "74%",
    });
  });
});

describe("checkRows", () => {
  it("puts a figure on each check, counted from the code", () => {
    expect(checkRows(models).map((c) => [c.name, c.figure])).toEqual([
      ["Tested on games it never saw", "3 models"],
      ["Golden tests", "4 games"],
      ["Rebuilt items", "1,370 of 1,370"],
      ["Checks on every change", "Every PR"],
    ]);
  });
});

describe("figures kept in code", () => {
  // These two aren't in a model file, so each is checked against where it
  // really comes from.
  it("counts every golden test game in the fixtures folder", () => {
    const fixtures = join(process.cwd(), "src/lib/analyzer/fixtures");
    const games = readdirSync(fixtures).filter((name) => name.endsWith(".json"));
    expect(GOLDEN_GAMES).toBe(games.length);
  });

  it("matches the item check's result in docs/replay.md", () => {
    const doc = readFileSync(join(process.cwd(), "docs/replay.md"), "utf8");
    const n = (v: number) => v.toLocaleString("en-US");
    expect(doc).toContain(
      `| All six items | ${n(ITEM_CHECK.matched)} of ${n(ITEM_CHECK.players)} `,
    );
  });

  it("reads Riot's slowest rate limit from the client's limits", () => {
    expect(riotLimit()).toBe("100 requests every 2 minutes");
  });
});
