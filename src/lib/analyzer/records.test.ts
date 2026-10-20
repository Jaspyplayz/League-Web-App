import { describe, expect, it } from "vitest";
import {
  MIN_RECORD_GAMES,
  recordGame,
  recordSentence,
  recordsSetBy,
  seasonRecords,
  type RecordGame,
  type RecordStat,
} from "./records";
import { clock, frames, kill, match, participants } from "./test-fixtures";
import type { TrimmedEvent } from "./trim";

// participantId 2 is blue's Vi (jungle), 7 red's Lee Sin.
const VI = 2;
const LEE = 7;

const levelUps = (participantId: number, at: string[]): TrimmedEvent[] =>
  at.map((t) => ({
    type: "SKILL_LEVEL_UP",
    timestamp: clock(t),
    participantId,
    skillSlot: 1,
  }));

describe("recordGame", () => {
  const timeline = {
    frames: frames(20, (minute, id) => ({
      cs: id === VI ? minute * 6 : minute * 5,
      gold: id === VI ? 500 + minute * 400 : 500 + minute * 350,
    })),
    events: [
      ...levelUps(VI, ["1:30", "3:00", "4:00", "5:00", "6:00", "6:42", "8:00"]),
      kill("4:30", VI, 8, [1]),
      kill("6:00", 3, VI),
      kill("9:00", LEE, 4, [VI]),
      kill("15:00", 8, VI), // after 14:00
    ],
  };

  it("reads the early-game numbers", () => {
    const game = recordGame(match(), timeline, "player-2")!;
    expect(game).toMatchObject({
      matchId: "NA1_1",
      championName: "Vi",
      position: "JUNGLE",
      win: false,
      queueId: 420,
    });
    expect(game.stats).toEqual({
      csAt10: 60,
      goldAt15: 750, // (400 - 350) * 15
      level6: 6 * 60 + 42,
      earlyDeaths: 1,
      earlyTakedowns: 2,
    });
  });

  it("leaves out what the game can't tell", () => {
    const short = { frames: frames(10), events: [] };
    const game = recordGame(match(participants(), 15 * 60), short, "player-2")!;
    // The game ended at 10 minutes in the frames, so no CS at 10 or gold at 15.
    expect(game.stats.csAt10).toBeNull();
    expect(game.stats.goldAt15).toBeNull();
    expect(game.stats.level6).toBeNull();
  });

  it("skips games too short to analyze, and players who aren't in the game", () => {
    expect(recordGame(match(participants(), 600), timeline, "player-2")).toBeNull();
    expect(recordGame(match(), timeline, "nobody")).toBeNull();
  });
});

let day = 0;
// A game on `championName` in `position`, a day after the last one made.
function game(
  stats: Partial<Record<RecordStat, number | null>>,
  championName = "Vi",
  position = "JUNGLE",
): RecordGame {
  day++;
  return {
    matchId: `NA1_${day}`,
    startedAt: day * 86_400_000,
    queueId: 420,
    championName,
    position,
    win: true,
    stats: {
      csAt10: null,
      goldAt15: null,
      level6: null,
      earlyDeaths: null,
      earlyTakedowns: null,
      ...stats,
    },
  };
}

// `count` games with the same numbers.
const games = (count: number, stats: Partial<Record<RecordStat, number>>, champion = "Vi") =>
  Array.from({ length: count }, () => game(stats, champion));

describe("recordsSetBy", () => {
  it("finds a role record when the game beats every earlier game in the role", () => {
    const earlier = [...games(3, { csAt10: 60 }), game({ csAt10: 70 }, "LeeSin")];
    const best = game({ csAt10: 75 });
    expect(recordsSetBy(best, earlier)).toEqual([
      {
        stat: "csAt10",
        championName: null,
        position: "JUNGLE",
        value: 75,
        previous: 70,
        games: 5,
        since: null,
      },
    ]);
  });

  it("needs enough games so a new champion doesn't set records every game", () => {
    const earlier = games(MIN_RECORD_GAMES - 2, { csAt10: 60 });
    expect(recordsSetBy(game({ csAt10: 90 }), earlier)).toEqual([]);
  });

  it("falls back to a champion record when the role record still stands", () => {
    const earlier = [
      game({ csAt10: 90 }, "LeeSin"),
      ...games(4, { csAt10: 60 }),
    ];
    const lines = recordsSetBy(game({ csAt10: 70 }), earlier);
    expect(lines).toMatchObject([{ championName: "Vi", value: 70, previous: 60, games: 5 }]);
  });

  it("doesn't count a tie, and lower is better for level 6 and early deaths", () => {
    const earlier = games(4, { earlyDeaths: 0, level6: 400 });
    const lines = recordsSetBy(game({ earlyDeaths: 0, level6: 380 }), earlier);
    expect(lines.map((l) => l.stat)).toEqual(["level6"]);
  });

  it("says when a later game beat it", () => {
    const earlier = games(4, { earlyTakedowns: 2 });
    const record = game({ earlyTakedowns: 5 });
    const later = [game({ earlyTakedowns: 3 }), game({ earlyTakedowns: 7 })];
    expect(recordsSetBy(record, [...earlier, ...later])).toMatchObject([
      { stat: "earlyTakedowns", value: 5, games: 5, since: 7 },
    ]);
  });

  it("leaves supports out of CS records, and games without a role out of everything", () => {
    const supports = Array.from({ length: 4 }, () => game({ csAt10: 10 }, "Thresh", "UTILITY"));
    expect(recordsSetBy(game({ csAt10: 30 }, "Thresh", "UTILITY"), supports)).toEqual([]);
    const aram = Array.from({ length: 4 }, () => game({ earlyTakedowns: 1 }, "Vi", ""));
    expect(recordsSetBy(game({ earlyTakedowns: 9 }, "Vi", ""), aram)).toEqual([]);
  });
});

describe("recordSentence", () => {
  const label = (name: string) => (name === "LeeSin" ? "Lee Sin" : name);

  it("writes a role record and a champion record", () => {
    expect(
      recordSentence(
        { stat: "csAt10", championName: null, position: "JUNGLE", value: 82, previous: 76, games: 23, since: null },
        label,
      ),
    ).toBe("Most CS at 10 in your 23 jungle games this season: 82 CS, beating 76 CS.");
    expect(
      recordSentence(
        { stat: "goldAt15", championName: "LeeSin", position: "JUNGLE", value: 1240, previous: 900, games: 12, since: 1500 },
        label,
      ),
    ).toBe(
      "Biggest gold lead at 15 in your first 12 Lee Sin games this season: 1,240 ahead, beating 900 ahead. You've since reached 1,500 ahead.",
    );
  });
});

describe("seasonRecords", () => {
  it("groups by role, then by champion, most played first, with enough games each", () => {
    const played = [
      ...games(6, { csAt10: 60 }, "Vi"),
      game({ csAt10: 80, level6: 390 }, "Vi"),
      ...games(2, { csAt10: 90 }, "LeeSin"),
      ...Array.from({ length: 5 }, () => game({ earlyDeaths: 1 }, "Ahri", "MIDDLE")),
      ...Array.from({ length: 4 }, () => game({ earlyDeaths: 0 }, "Gnar", "TOP")),
    ];
    const records = seasonRecords(played);
    expect(records.map((r) => [r.position, r.games])).toEqual([
      ["JUNGLE", 9],
      ["MIDDLE", 5],
    ]);
    const jungle = records[0];
    expect(jungle.best.csAt10).toMatchObject({ value: 90, games: 9 });
    // Only one game had level 6, too few for a record.
    expect(jungle.best.level6).toBeUndefined();
    expect(jungle.champions.map((c) => c.championName)).toEqual(["Vi"]);
    expect(jungle.champions[0].best.csAt10).toMatchObject({ value: 80, games: 7 });
    // The first game to reach a number keeps the record.
    expect(records[1].best.earlyDeaths?.matchId).toBe(
      played.find((g) => g.position === "MIDDLE")!.matchId,
    );
  });
});
