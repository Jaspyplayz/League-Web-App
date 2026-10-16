import { describe, expect, it } from "vitest";
import type { Timeline, TimelineParticipantFrame } from "@/lib/riot/types";
import { clock, frames, kill, match, participants, SPOTS } from "./test-fixtures";
import {
  aliveCheck,
  auc,
  callAccuracy,
  crossValidated,
  estimateErrors,
  fitLogistic,
  hash,
  playsOf,
  predict,
  respawnRows,
  studyRows,
  toStudyGame,
  type StudyGame,
} from "./tempo-study";
import type { TrimmedEvent } from "./trim";

function rawTimeline(minutes: number): Timeline {
  const frame = (minute: number) => ({
    timestamp: minute * 60_000,
    participantFrames: Object.fromEntries(
      Array.from({ length: 10 }, (_, i) => {
        const id = i + 1;
        const p: TimelineParticipantFrame & { championStats: Record<string, number> } = {
          participantId: id,
          totalGold: 500 + minute * 400,
          currentGold: minute * 50,
          xp: minute * 300,
          level: 1 + minute,
          minionsKilled: minute,
          jungleMinionsKilled: id === 2 || id === 7 ? minute * 6 : 0,
          position: { x: 100 * id, y: 100 * id },
          championStats: { health: 600 + id, healthMax: 1000 + id },
        };
        return [String(id), p];
      }),
    ),
    events: [],
  });
  return {
    metadata: { matchId: "NA1_1" },
    info: { frameInterval: 60_000, frames: Array.from({ length: minutes + 1 }, (_, m) => frame(m)) },
  };
}

describe("toStudyGame", () => {
  it("keeps the trimmed timeline, each player's role and side, and the extra numbers", () => {
    const game = toStudyGame(match(), rawTimeline(20), "MASTER", "oce")!;
    expect(game.matchId).toBe("NA1_1");
    expect(game.tier).toBe("MASTER");
    expect(game.patch).toBe("16.20");
    expect(game.participants[1]).toEqual({
      participantId: 2,
      teamId: 100,
      position: "JUNGLE",
      championName: "Vi",
      win: false,
    });
    expect(game.timeline.frames).toHaveLength(21);
    expect(game.timeline.frames[3].players[1].unspentGold).toBe(150);
    expect(game.extra[3][1]).toEqual({ health: 602, healthMax: 1002, jungleCs: 18 });
    expect(game.extra[3][0].jungleCs).toBe(0);
  });

  it("leaves no names or PUUIDs in the saved game", () => {
    const text = JSON.stringify(toStudyGame(match(), rawTimeline(20), "MASTER", "oce"));
    expect(text).not.toContain("player-1");
    expect(text).not.toContain("Player1");
  });

  it("skips other queues, short games and games without one jungler per side", () => {
    const aram = match();
    aram.info.queueId = 450;
    expect(toStudyGame(aram, rawTimeline(20), "GOLD", "oce")).toBeNull();
    expect(toStudyGame(match(participants(), 14 * 60), rawTimeline(14), "GOLD", "oce")).toBeNull();
    const noJungler = participants().map((p) =>
      p.participantId === 7 ? { ...p, teamPosition: "MIDDLE" } : p,
    );
    expect(toStudyGame(match(noJungler), rawTimeline(20), "GOLD", "oce")).toBeNull();
  });
});

// A study game built from the made-up timeline helpers, with participant 2
// as blue's jungler and 7 as red's.
function studyGame(events: TrimmedEvent[], minutes = 20): StudyGame {
  const f = frames(minutes, (minute, id) => ({
    gold: 500 + minute * (id === 2 ? 450 : 400),
    unspentGold: id === 2 ? 50 : minute * 400,
    level: 1 + Math.floor(minute / 2),
    cs: minute * 6,
  }));
  f.push({ timestamp: f.at(-1)!.timestamp + 20_000, players: f.at(-1)!.players });
  return {
    matchId: "OC1_1",
    region: "oce",
    tier: "MASTER",
    patch: "16.20",
    durationS: minutes * 60 + 20,
    participants: participants().map((p) => ({
      participantId: p.participantId,
      teamId: p.teamId,
      position: p.teamPosition,
      championName: p.championName,
      win: p.win,
    })),
    timeline: { frames: f, events },
    extra: f.map((_, i) =>
      Array.from({ length: 10 }, (_, id) => ({
        health: id === 1 ? 900 : 450,
        healthMax: 1000,
        jungleCs: i * (id === 1 ? 5 : 4),
      })),
    ),
  };
}

describe("studyRows", () => {
  const game = studyGame([
    kill("5:30", 2, 8, [], SPOTS.midLane),
    kill("9:10", 7, 3),
    // Not a jungler fight: neither jungler was involved.
    kill("12:20", 4, 9),
    {
      type: "ELITE_MONSTER_KILL",
      timestamp: clock("6:15"),
      killerTeamId: 200,
      monsterType: "DRAGON",
      monsterSubType: "FIRE_DRAGON",
      killerId: 7,
      assistingParticipantIds: [],
    },
    kill("14:30", 2, 7),
  ]);
  const { minutes, objectives, duels } = studyRows(game);
  const at = (m: number) => minutes.find((r) => r.minute === m)!;

  it("reads who was alive from the health snapshots too", () => {
    const game = studyGame([kill("4:50", 7, 2)]);
    // At 5:00 the timer says blue's jungler is dead (back at 5:02); the
    // snapshot says they're up, and one of red's laners is at 0.
    game.extra[5][7].health = 0;
    const row = studyRows(game).minutes.find((r) => r.minute === 5)!;
    expect(row.f.alive).toBe(-1);
    expect(row.f.aliveHp).toBe(0);
    expect(row.f.numbers).toBe(-1);
    expect(row.f.numbersHp).toBe(1);
  });

  it("starts at minute 2 and takes blue's jungler minus red's", () => {
    expect(minutes[0].minute).toBe(2);
    expect(at(4).f.gold).toBe(200);
    expect(at(4).f.unspent).toBe(50 - 1600);
    expect(at(4).f.itemGold).toBe(2250 - 500);
    expect(at(4).f.hp).toBeCloseTo(0.45);
    expect(at(4).f.jungleCs2).toBe(2);
    // By 10:00 blue's jungler has spent 4,450 more on items.
    expect(at(10).tone).toBe("ahead");
  });

  it("labels each minute with who won the next jungler fight or epic monster within a minute", () => {
    expect(at(5).nextPlay).toBe(1);
    expect(at(6).nextPlay).toBe(0);
    expect(at(9).nextPlay).toBe(0);
    expect(at(12).nextPlay).toBeNull();
    expect(at(7).nextPlay).toBeNull();
  });

  it("can look further ahead for the next play, and notes the time since the last kill", () => {
    const later = studyRows(game, 120_000).minutes;
    const row = (m: number) => later.find((r) => r.minute === m)!;
    expect(row(13).nextPlay).toBe(1); // the 14:30 kill, more than a minute later
    expect(row(12).nextPlay).toBeNull(); // 12:20 had no jungler in it
    expect(at(5).sinceKillS).toBe(Infinity);
    expect(at(6).sinceKillS).toBe(30);
  });

  it("lists epic monsters with the calls before them", () => {
    expect(objectives).toHaveLength(1);
    expect(objectives[0]).toMatchObject({ kind: "dragon", blueTook: false, spawnsAt: clock("5:00") });
    expect(objectives[0].before?.minute).toBe(6);
    expect(objectives[0].minuteBefore?.minute).toBe(5);
    expect(objectives[0].atSpawn?.minute).toBe(5);
  });

  it("finds kills between the two junglers", () => {
    expect(duels).toEqual([
      expect.objectContaining({ at: clock("14:30"), blueWon: true }),
    ]);
    expect(duels[0].before?.minute).toBe(14);
  });
});

describe("aliveCheck", () => {
  it("compares deaths by the timer with health 0 in the snapshots", () => {
    const game = studyGame([kill("4:50", 7, 2)]);
    // Blue's jungler shows 0 health at 5:00 (died 4:50 at level 3, back at 5:02).
    game.extra[5][1].health = 0;
    // Someone else shows 0 health with no death logged.
    game.extra[8][3].health = 0;
    const c = aliveCheck(game);
    expect(c.bothDead).toBe(1);
    expect(c.timerOnly).toBe(0);
    expect(c.healthOnly).toBe(1);
    expect(c.bothAlive).toBe(20 * 10 - 2);
  });
});

describe("respawnRows", () => {
  it("lists deaths with whether the next snapshot still showed 0 health", () => {
    const game = studyGame([kill("4:50", 7, 2), kill("7:40", 8, 3), kill("9:05", 8, 4)]);
    // Blue's jungler (level 3, a 12 second timer) still shows 0 health at 5:00.
    game.extra[5][1].health = 0;
    expect(respawnRows(game)).toEqual([
      { minute: clock("4:50") / 60_000, level: 3, timerS: 12, gapS: 10, deadAtMark: true, revive: false },
      { minute: clock("7:40") / 60_000, level: 4, timerS: 12, gapS: 20, deadAtMark: false, revive: false },
      // The 9:05 death is left out: 55 seconds later is long after the timer ran out.
    ]);
  });

  it("notes when a revive was possible", () => {
    const game = studyGame([
      { type: "ITEM_PURCHASED", timestamp: clock("3:00"), participantId: 2, itemId: 3026 },
      kill("4:50", 7, 2),
      kill("7:40", 2, 7),
    ]);
    // Guardian Angel for blue's jungler; nothing for red's.
    expect(respawnRows(game).map((r) => r.revive)).toEqual([true, false]);
    game.participants[9].championName = "Zilean";
    expect(respawnRows(game).map((r) => r.revive)).toEqual([true, true]);
  });

  it("skips a death followed by another before the snapshot", () => {
    const game = studyGame([kill("4:10", 7, 2), kill("4:40", 7, 2)]);
    expect(respawnRows(game).map((r) => r.minute)).toEqual([clock("4:40") / 60_000]);
  });
});

describe("estimateErrors", () => {
  it("measures how far the shop visit estimate is from the exact item gold", () => {
    const errors = estimateErrors(
      studyGame([{ type: "ITEM_PURCHASED", timestamp: clock("0:05"), participantId: 2, itemId: 1 }]),
    );
    // Two junglers, minutes 2 to 20.
    expect(errors).toHaveLength(2 * 19);
    expect(errors.every((e) => Number.isFinite(e.line) && Number.isFinite(e.before))).toBe(true);
  });
});

describe("playsOf", () => {
  it("keeps kills a jungler was in and epic monsters, with who came out ahead", () => {
    const plays = playsOf(
      [
        kill("3:00", 4, 9),
        kill("4:00", 0, 2),
        kill("5:00", 8, 3, [7]),
        {
          type: "ELITE_MONSTER_KILL",
          timestamp: clock("6:00"),
          killerTeamId: 100,
          monsterType: "HORDE",
          monsterSubType: null,
          killerId: 1,
          assistingParticipantIds: [],
        },
      ],
      studyGame([]).participants,
      [2, 7],
    );
    expect(plays).toEqual([
      { timestamp: clock("4:00"), blueWon: false },
      { timestamp: clock("5:00"), blueWon: false },
      { timestamp: clock("6:00"), blueWon: true },
    ]);
  });
});

describe("auc", () => {
  it("is 1 when the score always ranks wins higher, 0.5 for no signal", () => {
    expect(auc([{ score: 1, won: false }, { score: 2, won: true }])).toBe(1);
    expect(auc([{ score: 2, won: false }, { score: 1, won: true }])).toBe(0);
    expect(auc([{ score: 1, won: false }, { score: 1, won: true }])).toBe(0.5);
    expect(auc([{ score: 1, won: true }])).toBe(0.5);
  });

  it("matches counting every winning and losing pair", () => {
    const points = [3, 1, 4, 1, 5, 9, 2, 6].map((score, i) => ({ score, won: i % 3 === 0 }));
    const wins = points.filter((p) => p.won);
    const losses = points.filter((p) => !p.won);
    let pairs = 0;
    for (const w of wins) for (const l of losses) pairs += w.score > l.score ? 1 : w.score === l.score ? 0.5 : 0;
    expect(auc(points)).toBeCloseTo(pairs / (wins.length * losses.length));
  });
});

describe("callAccuracy", () => {
  it("counts only moments with a call", () => {
    expect(
      callAccuracy([
        { tone: "ahead", won: true },
        { tone: "behind", won: true },
        { tone: "behind", won: false },
        { tone: "even", won: true },
      ]),
    ).toEqual({ calls: 3, share: 0.75, right: 2 / 3 });
  });
});

describe("fitLogistic", () => {
  it("finds the weights that made the data", () => {
    let seed = 3;
    const random = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed / 2_147_483_648;
    };
    const rows = Array.from({ length: 4000 }, () => {
      const x = [random() * 4 - 2, random() * 4 - 2];
      const p = 1 / (1 + Math.exp(-(0.5 + 1.5 * x[0] - 1 * x[1])));
      return { x, won: random() < p };
    });
    const [bias, a, b] = fitLogistic(rows);
    expect(bias).toBeCloseTo(0.5, 0);
    expect(a).toBeCloseTo(1.5, 0);
    expect(b).toBeCloseTo(-1, 0);
    expect(predict([bias, a, b], [0, 0])).toBeCloseTo(1 / (1 + Math.exp(-bias)));
  });

  it("does better than a coin flip on games it didn't see when there's a signal", () => {
    const rows = Array.from({ length: 600 }, (_, i) => ({
      matchId: `G${Math.floor(i / 6)}`,
      x: [i % 2 === 0 ? 1 : -1],
      won: (i % 2 === 0) !== (i % 10 === 0),
    }));
    const { logLoss, auc: a } = crossValidated(rows);
    expect(logLoss).toBeLessThan(0.693);
    expect(a).toBeGreaterThan(0.7);
  });
});

describe("hash", () => {
  it("gives the same number for the same text", () => {
    expect(hash("OC1_123")).toBe(hash("OC1_123"));
    expect(hash("OC1_123")).not.toBe(hash("OC1_124"));
  });
});
