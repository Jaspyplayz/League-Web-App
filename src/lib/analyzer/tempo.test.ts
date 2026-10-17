import { describe, expect, it } from "vitest";
import type { PlayerFrame, TrimmedEvent, TrimmedTimeline } from "./trim";
import { clock, frames, kill, participants, SPOTS } from "./test-fixtures";
import {
  deathSpans,
  describeTempo,
  goldAt,
  HOLDING_GOLD,
  itemGoldAt,
  LEVEL_GOLD,
  objectiveWindows,
  PLAYER_GOLD,
  respawnSeconds,
  shopVisits,
  stretchAt,
  TEMPO_LEAD,
  tempoMinutes,
  tempoTimeline,
  tempoTone,
  type TempoMinute,
} from "./tempo";

// In the fixtures, participant 2 is blue side's jungler (Vi) and 7 is red
// side's (Lee Sin).
const ME = 2;
const ENEMY = 7;
const players = participants();

function buy(at: string, participantId: number, itemId = 1036): TrimmedEvent {
  return { type: "ITEM_PURCHASED", timestamp: clock(at), participantId, itemId };
}

function monster(
  at: string,
  killerTeamId: number,
  monsterType: string,
  monsterSubType: string | null = null,
  killerId = killerTeamId === 100 ? ME : ENEMY,
  assists: number[] = [],
): TrimmedEvent & { type: "ELITE_MONSTER_KILL" } {
  return {
    type: "ELITE_MONSTER_KILL",
    timestamp: clock(at),
    killerTeamId,
    monsterType,
    monsterSubType,
    killerId,
    assistingParticipantIds: assists,
  };
}

// A game's frames up to `minutes`, plus a final frame 30 seconds later for
// the end of the game, like Riot's.
function game(
  minutes: number,
  stats: (minute: number, id: number) => Partial<PlayerFrame>,
  events: TrimmedEvent[] = [],
): TrimmedTimeline {
  const f = frames(minutes, stats);
  const last = f.at(-1)!;
  f.push({ timestamp: last.timestamp + 30_000, players: last.players });
  return { frames: f, events: [...events].sort((a, b) => a.timestamp - b.timestamp) };
}

describe("respawnSeconds", () => {
  it("uses the base time for the level before 15 minutes", () => {
    expect(respawnSeconds(1, clock("5:00"))).toBe(10);
    expect(respawnSeconds(6, clock("10:00"))).toBe(16);
    expect(respawnSeconds(18, clock("14:59"))).toBe(52.5);
  });

  it("adds a little every half minute after 15 minutes", () => {
    expect(respawnSeconds(10, clock("15:00"))).toBe(32.5);
    expect(respawnSeconds(10, clock("15:20"))).toBeCloseTo(32.5 * 1.00425);
    // 29:59 is 30 half minutes in: 12.75% more.
    expect(respawnSeconds(10, clock("29:59"))).toBeCloseTo(32.5 * 1.1275);
    expect(respawnSeconds(10, clock("30:00"))).toBeCloseTo(32.5 * 1.1275);
    expect(respawnSeconds(10, clock("44:59"))).toBeCloseTo(32.5 * 1.2175);
  });

  it("stops at 50% more, so the longest death timer is 78.75 seconds", () => {
    expect(respawnSeconds(18, clock("55:00"))).toBeCloseTo(78.75);
    expect(respawnSeconds(18, clock("70:00"))).toBeCloseTo(78.75);
  });

  it("treats odd levels as the nearest real one", () => {
    expect(respawnSeconds(0, 0)).toBe(10);
    expect(respawnSeconds(20, 0)).toBe(52.5);
  });
});

describe("deathSpans", () => {
  it("brings each player back after the death timer for their level when they died", () => {
    const timeline = game(10, (_, id) => ({ level: id === ENEMY ? 5 : 4 }), [
      kill("6:30", ME, ENEMY),
    ]);
    expect(deathSpans(timeline)).toEqual([
      { participantId: ENEMY, diedAt: clock("6:30"), respawnAt: clock("6:44") },
    ]);
  });
});

describe("shopVisits", () => {
  it("turns runs of purchases into visits", () => {
    const timeline = game(10, () => ({}), [
      buy("0:05", ME),
      buy("0:06", ME),
      buy("3:40", ME),
      buy("3:42", ME),
      buy("3:50", ME),
      buy("3:41", ENEMY),
    ]);
    expect(shopVisits(timeline, ME, [])).toEqual([
      { timestamp: clock("0:05"), afterDeath: false },
      { timestamp: clock("3:40"), afterDeath: false },
    ]);
  });

  it("marks visits while dead or just after respawning", () => {
    const timeline = game(12, () => ({ level: 8 }), [
      kill("8:00", ENEMY, ME),
      buy("8:10", ME),
      kill("9:00", ENEMY, ME),
      // Level 8 is back after 25 seconds, so 10:00 is a recall, not a respawn.
      buy("10:00", ME),
    ]);
    expect(shopVisits(timeline, ME, deathSpans(timeline))).toEqual([
      { timestamp: clock("8:10"), afterDeath: true },
      { timestamp: clock("10:00"), afterDeath: false },
    ]);
  });
});

describe("goldAt", () => {
  const f = frames(3, (minute) => ({ gold: 500 + minute * 600 }));

  it("reads gold between snapshots off a straight line", () => {
    expect(goldAt(f, ME, clock("1:30"))).toBe(1400);
    expect(goldAt(f, ME, clock("2:00"))).toBe(1700);
  });

  it("uses the first or last snapshot outside them", () => {
    expect(goldAt(f, ME, -5)).toBe(500);
    expect(goldAt(f, ME, clock("9:00"))).toBe(2300);
  });
});

describe("itemGoldAt", () => {
  it("is total gold minus unspent gold when Riot recorded it", () => {
    const f = frames(5, (minute) => ({ gold: 500 + minute * 400, unspentGold: 150 }));
    expect(itemGoldAt(f, 5, ME, [])).toBe(2350);
  });

  it("estimates it from the last shop visit for older timelines", () => {
    const f = frames(5, (minute) => ({ gold: [500, 500, 700, 1000, 1200, 1500][minute] }));
    const visits = [
      { timestamp: clock("0:05"), afterDeath: false },
      { timestamp: clock("3:30"), afterDeath: false },
    ];
    expect(itemGoldAt(f, 4, ME, visits)).toBe(1100);
    // Before the 3:30 visit, the last one was at the start.
    expect(itemGoldAt(f, 3, ME, visits)).toBe(500);
    expect(itemGoldAt(f, 3, ME, [])).toBe(0);
  });

  it("never says more was spent than earned", () => {
    const f = frames(2, () => ({ gold: 800, unspentGold: 900 }));
    expect(itemGoldAt(f, 2, ME, [])).toBe(0);
    const g = frames(2, (minute) => ({ gold: minute === 2 ? 100 : 800 }));
    expect(itemGoldAt(g, 2, ME, [{ timestamp: clock("1:00"), afterDeath: false }])).toBe(100);
  });
});

describe("tempoTone", () => {
  const jungler = (itemGold: number, level = 6, alive = true) => ({ itemGold, level, alive });
  const allAlive = { ours: 5, theirs: 5 };

  it("calls it even inside the threshold", () => {
    expect(tempoTone(jungler(3000), jungler(3000 - TEMPO_LEAD + 1), allAlive)).toEqual({
      tone: "even",
      lead: TEMPO_LEAD - 1,
    });
  });

  it("calls the side ahead by the threshold or more up tempo", () => {
    expect(tempoTone(jungler(3000 + TEMPO_LEAD), jungler(3000), allAlive).tone).toBe("ahead");
    expect(tempoTone(jungler(3000), jungler(3000 + TEMPO_LEAD), allAlive).tone).toBe("behind");
  });

  it("counts each level as LEVEL_GOLD", () => {
    expect(tempoTone(jungler(2000, 8), jungler(2000, 6), allAlive).lead).toBe(2 * LEVEL_GOLD);
    expect(tempoTone(jungler(2000, 6), jungler(2000 + LEVEL_GOLD, 7), allAlive).lead).toBe(
      -2 * LEVEL_GOLD,
    );
  });

  it("counts each extra player alive as PLAYER_GOLD", () => {
    expect(tempoTone(jungler(2000), jungler(2000), { ours: 5, theirs: 3 }).lead).toBe(2 * PLAYER_GOLD);
    expect(tempoTone(jungler(2000), jungler(2000), { ours: 4, theirs: 5 }).lead).toBe(-PLAYER_GOLD);
  });

  it("puts whoever is alive up tempo whatever the lead", () => {
    expect(tempoTone(jungler(0, 1), jungler(5000, 18, false), allAlive).tone).toBe("ahead");
    expect(tempoTone(jungler(5000, 18, false), jungler(0, 1), allAlive).tone).toBe("behind");
    expect(tempoTone(jungler(5000, 18, false), jungler(0, 1, false), allAlive).tone).toBe("ahead");
  });
});

// You earn 400 gold a minute and Lee Sin 600. You shop at 6:40 with what you
// have; Lee Sin doesn't shop until 9:20. Lee Sin dies at 10:50. Everyone is
// level 1 + the minute at each snapshot.
const timeline = game(
  12,
  (minute, id) => ({
    gold: 500 + minute * (id === ENEMY ? 600 : 400),
    unspentGold:
      id === ME
        ? minute <= 6
          ? minute * 400
          : (minute - 7) * 400 + 100
        : id === ENEMY
          ? minute <= 9
            ? minute * 600
            : (minute - 10) * 600 + 50
          : 0,
    level: Math.min(18, 1 + minute),
    cs: minute * 5,
    position: id === ME ? SPOTS.jungle : id === ENEMY ? SPOTS.topLane : null,
  }),
  [
    buy("0:04", ME),
    buy("0:04", ENEMY),
    buy("6:40", ME),
    buy("6:41", ME),
    buy("9:20", ENEMY),
    kill("10:50", ME, ENEMY, [3], SPOTS.midLane),
    monster("11:20", 100, "DRAGON", "FIRE_DRAGON", ME, [4, 5]),
  ],
);

// The same game with old timelines' missing unspent gold.
const withoutUnspent: TrimmedTimeline = {
  ...timeline,
  frames: timeline.frames.map((f) => ({
    ...f,
    players: f.players.map(({ unspentGold, ...rest }) => (void unspentGold, rest)),
  })),
};

function skillPoint(at: string, participantId: number): TrimmedEvent {
  return { type: "SKILL_LEVEL_UP", timestamp: clock(at), participantId, skillSlot: 1 };
}

describe("tempoTimeline", () => {
  const tempo = tempoTimeline(timeline, players, ME, ENEMY);
  const at = (time: string) => stretchAt(tempo.stretches, clock(time))!;

  it("covers every second from 0:00 to the end of the game, in order", () => {
    const { stretches } = tempo;
    expect(stretches[0].from).toBe(0);
    expect(stretches.at(-1)!.to).toBe(clock("12:30"));
    for (const [i, s] of stretches.entries()) {
      expect(s.to).toBeGreaterThan(s.from);
      if (i > 0) expect(s.from).toBe(stretches[i - 1].to);
    }
    expect(tempo.meId).toBe(ME);
    expect(tempo.enemyId).toBe(ENEMY);
    expect(tempo.exactItemGold).toBe(true);
  });

  it("agrees with the call at each minute mark", () => {
    for (const m of tempoMinutes(timeline, players, ME, ENEMY)) {
      const s = stretchAt(tempo.stretches, m.timestamp)!;
      expect(s.tone).toBe(m.tone);
      expect(s.lead).toBe(m.lead);
    }
  });

  it("counts what you bought from the second you shopped, not from the next snapshot", () => {
    // Until 6:40 your items are the 6:00 snapshot's; from then, 7:00's.
    expect(at("6:39").you.itemGold).toBe(500);
    expect(at("6:39").tone).toBe("even");
    expect(at("6:40").you.itemGold).toBe(3200);
    expect(at("6:40").you.lastShop).toBe(clock("6:40"));
    expect(at("6:40").tone).toBe("ahead");
    expect(at("6:40").lead).toBe(2700);
  });

  it("swings at the exact second of a death, and back at the respawn", () => {
    // Lee Sin died at 10:50 at level 11: 35 seconds, back at 11:25.
    expect(at("10:49").tone).toBe("behind");
    expect(at("10:50").tone).toBe("ahead");
    expect(at("10:50").them.alive).toBe(false);
    expect(at("10:50").them.respawnAt).toBe(clock("11:25"));
    expect(at("10:50").alive).toEqual({ ours: 5, theirs: 4 });
    expect(at("11:24").tone).toBe("ahead");
    expect(at("11:25").tone).toBe("behind");
    expect(at("11:25").alive).toEqual({ ours: 5, theirs: 5 });
    // The jump is exact to the millisecond.
    expect(stretchAt(tempo.stretches, clock("10:50") - 1)!.tone).toBe("behind");
  });

  it("levels up at the skill point, kept between the snapshots either side", () => {
    // Five skill points by 3:30 means level 5 before the 4:00 snapshot says
    // so; a sixth at 3:40 can't go past it.
    const points = ["0:10", "1:05", "2:01", "3:02", "3:30", "3:40"].map((t) => skillPoint(t, ME));
    const leveled = tempoTimeline(
      { ...timeline, events: [...timeline.events, ...points].sort((a, b) => a.timestamp - b.timestamp) },
      players,
      ME,
      ENEMY,
    );
    const call = (time: string) => stretchAt(leveled.stretches, clock(time))!;
    expect(call("3:29").you.level).toBe(4);
    expect(call("3:29").tone).toBe("even");
    expect(call("3:30").you.level).toBe(5);
    expect(call("3:30").lead).toBe(LEVEL_GOLD);
    expect(call("3:30").tone).toBe("ahead");
    expect(call("3:45").you.level).toBe(5);
    // Lee Sin logged no skill points, so his level is the snapshot's.
    expect(call("3:30").them.level).toBe(4);
  });

  it("estimates item gold for timelines saved without unspent gold", () => {
    const estimated = tempoTimeline(withoutUnspent, players, ME, ENEMY);
    expect(estimated.exactItemGold).toBe(false);
    // Gold at 6:40, read between 6:00 (2,900) and 7:00 (3,300).
    expect(stretchAt(estimated.stretches, clock("6:40"))!.you.itemGold).toBe(3167);
    expect(stretchAt(estimated.stretches, clock("6:40"))!.tone).toBe("ahead");
  });

  it("lists everything each jungler did, to the second", () => {
    expect(tempo.activities.you).toEqual([
      { type: "shop", timestamp: clock("0:04"), afterDeath: false },
      { type: "shop", timestamp: clock("6:40"), afterDeath: false },
      {
        type: "takedown",
        timestamp: clock("10:50"),
        victimId: ENEMY,
        killed: true,
        position: SPOTS.midLane,
      },
      { type: "objective", timestamp: clock("11:20"), kind: "dragon", killed: true },
    ]);
    expect(tempo.activities.them).toEqual([
      { type: "shop", timestamp: clock("0:04"), afterDeath: false },
      { type: "shop", timestamp: clock("9:20"), afterDeath: false },
      {
        type: "died",
        timestamp: clock("10:50"),
        killerId: ME,
        position: SPOTS.midLane,
        respawnAt: clock("11:25"),
      },
    ]);
  });

  it("gives the mirror answer from the enemy jungler's side", () => {
    const mirror = tempoTimeline(timeline, players, ENEMY, ME);
    expect(mirror.stretches).toHaveLength(tempo.stretches.length);
    for (const [i, s] of tempo.stretches.entries()) {
      const other = mirror.stretches[i];
      expect(other.from).toBe(s.from);
      expect(other.tone).toBe(FLIP[s.tone]);
      expect(other.lead + s.lead).toBe(0);
      expect(other.alive).toEqual({ ours: s.alive.theirs, theirs: s.alive.ours });
      expect(other.you).toEqual(s.them);
    }
  });
});

describe("tempoMinutes", () => {
  const minutes = tempoMinutes(timeline, players, ME, ENEMY);
  const at = (m: number) => minutes.find((x) => x.timestamp === m * 60_000)!;

  it("has one entry per minute mark, leaving out the start and the end of the game", () => {
    expect(minutes.map((m) => m.timestamp / 60_000)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("is even while neither jungler has shopped since the start", () => {
    expect(at(5).tone).toBe("even");
    expect(at(5).lead).toBe(0);
    expect(at(5).you.itemGold).toBe(500);
    expect(at(5).you.unspentGold).toBe(2000);
  });

  it("puts the jungler who just spent their gold up tempo", () => {
    // You spent 3,200 by 7:00; Lee Sin still has only the starting 500.
    expect(at(7).you.itemGold).toBe(3200);
    expect(at(7).them.itemGold).toBe(500);
    expect(at(7).tone).toBe("ahead");
    expect(at(7).lead).toBe(2700);
    expect(at(7).you.lastShop).toBe(clock("6:40"));
    expect(at(7).them.lastShop).toBe(clock("0:04"));
  });

  it("swings back when the other jungler shops", () => {
    expect(at(10).them.itemGold).toBe(6450);
    expect(at(10).lead).toBe(3200 - 6450);
    expect(at(10).tone).toBe("behind");
  });

  it("puts the alive jungler up tempo while the other is dead", () => {
    expect(at(11).them.alive).toBe(false);
    expect(at(11).them.respawnAt).toBe(clock("11:25"));
    expect(at(11).tone).toBe("ahead");
    expect(at(11).alive).toEqual({ ours: 5, theirs: 4 });
    expect(at(12).them.alive).toBe(true);
    expect(at(12).alive).toEqual({ ours: 5, theirs: 5 });
  });

  it("estimates item gold for timelines saved without unspent gold", () => {
    const seven = tempoMinutes(withoutUnspent, players, ME, ENEMY)[6];
    expect(seven.you.itemGold).toBe(3167);
    expect(seven.tone).toBe("ahead");
  });

  it("gives the mirror answer from the enemy jungler's side", () => {
    const mirror = tempoMinutes(timeline, players, ENEMY, ME);
    for (const [i, m] of minutes.entries()) {
      expect(mirror[i].tone).toBe(FLIP[m.tone]);
      expect(mirror[i].lead + m.lead).toBe(0);
      expect(mirror[i].alive).toEqual({ ours: m.alive.theirs, theirs: m.alive.ours });
    }
  });
});

describe("tempo on made-up games", () => {
  // A small seeded random number generator, so a failure can be replayed.
  function random(seed: number) {
    return () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed / 2_147_483_648;
    };
  }

  it("always mirrors, never calls a dead jungler up tempo, and counts alive players sensibly", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const r = random(seed);
      const minutes = 16 + Math.floor(r() * 25);
      const gold = Array.from({ length: 10 }, () => 300 + r() * 200);
      const events: TrimmedEvent[] = [];
      for (let i = 0; i < 60; i++) {
        const at = Math.floor(r() * minutes * 60);
        const time = `${Math.floor(at / 60)}:${String(at % 60).padStart(2, "0")}`;
        const id = 1 + Math.floor(r() * 10);
        const roll = r();
        if (roll < 0.35) events.push(buy(time, id));
        else if (roll < 0.7) events.push(kill(time, ((id + 4) % 10) + 1, id));
        else events.push(skillPoint(time, id));
      }
      const timeline = game(
        minutes,
        (minute, id) => ({
          gold: Math.round(500 + gold[id - 1] * minute),
          level: Math.min(18, 1 + Math.floor(minute * (0.6 + r() * 0.2))),
          cs: minute * 6,
        }),
        events,
      );

      const mine = tempoTimeline(timeline, players, ME, ENEMY);
      const theirs = tempoTimeline(timeline, players, ENEMY, ME);
      expect(theirs.stretches).toHaveLength(mine.stretches.length);
      for (const [i, s] of mine.stretches.entries()) {
        expect(theirs.stretches[i].lead + s.lead).toBe(0);
        expect(theirs.stretches[i].tone).toBe(FLIP[s.tone]);
        if (i > 0) expect(s.from).toBe(mine.stretches[i - 1].to);
        if (!s.you.alive && s.them.alive) expect(s.tone).toBe("behind");
        if (s.you.alive && !s.them.alive) expect(s.tone).toBe("ahead");
        expect(s.alive.ours).toBeGreaterThanOrEqual(0);
        expect(s.alive.ours).toBeLessThanOrEqual(5);
        expect(s.you.level).toBeGreaterThanOrEqual(1);
        expect(s.you.level).toBeLessThanOrEqual(18);
      }

      for (const m of tempoMinutes(timeline, players, ME, ENEMY)) {
        expect(m.you.itemGold + m.you.unspentGold).toBe(m.you.gold);
      }
    }
  });
});

const FLIP = { ahead: "behind", behind: "ahead", even: "even" } as const;

describe("objectiveWindows", () => {
  it("brings dragons back five minutes after each one is taken", () => {
    const windows = objectiveWindows(
      [monster("6:00", 100, "DRAGON", "FIRE_DRAGON"), monster("11:30", 200, "DRAGON", "WATER_DRAGON")],
      100,
      clock("14:00"),
    );
    expect(windows.filter((w) => w.kind === "dragon")).toEqual([
      { kind: "dragon", spawnsAt: clock("5:00"), takenAt: clock("6:00"), ours: true, endsAt: clock("6:00") },
      { kind: "dragon", spawnsAt: clock("11:00"), takenAt: clock("11:30"), ours: false, endsAt: clock("11:30") },
    ]);
  });

  it("leaves a dragon that's up at the end of the game open", () => {
    const windows = objectiveWindows([monster("6:00", 100, "DRAGON", "FIRE_DRAGON")], 100, clock("20:00"));
    expect(windows.find((w) => w.spawnsAt === clock("11:00"))).toEqual({
      kind: "dragon",
      spawnsAt: clock("11:00"),
      takenAt: null,
      ours: null,
      endsAt: clock("20:00"),
    });
  });

  it("switches to Elder Dragon six minutes after a team's fourth dragon", () => {
    const kills = [
      monster("6:00", 200, "DRAGON", "FIRE_DRAGON"),
      monster("11:10", 200, "DRAGON", "FIRE_DRAGON"),
      monster("16:20", 100, "DRAGON", "WATER_DRAGON"),
      monster("21:30", 200, "DRAGON", "HEXTECH_DRAGON"),
      monster("26:40", 200, "DRAGON", "HEXTECH_DRAGON"),
      monster("33:00", 100, "DRAGON", "ELDER_DRAGON"),
    ];
    const windows = objectiveWindows(kills, 100, clock("45:00")).filter(
      (w) => w.kind === "dragon" || w.kind === "elder",
    );
    expect(windows.map((w) => [w.kind, w.spawnsAt / 1000, w.takenAt && w.takenAt / 1000])).toEqual([
      ["dragon", 300, 360],
      ["dragon", 660, 670],
      ["dragon", 970, 980],
      ["dragon", 1280, 1290],
      ["dragon", 1590, 1600],
      ["elder", 1960, 1980],
      ["elder", 2340, null],
    ]);
  });

  it("gives grubs to the team that took most of them, and lets them despawn", () => {
    const split = objectiveWindows(
      [
        monster("8:30", 100, "HORDE"),
        monster("8:40", 100, "HORDE"),
        monster("8:50", 200, "HORDE"),
      ],
      100,
      clock("25:00"),
    ).find((w) => w.kind === "grubs");
    expect(split).toEqual({
      kind: "grubs",
      spawnsAt: clock("8:00"),
      takenAt: clock("8:50"),
      ours: true,
      endsAt: clock("8:50"),
    });
    const untouched = objectiveWindows([], 100, clock("25:00")).find((w) => w.kind === "grubs");
    expect(untouched).toMatchObject({ takenAt: null, ours: null, endsAt: clock("14:45") });
  });

  it("lets Rift Herald despawn before Baron, and Baron come back six minutes after a kill", () => {
    const windows = objectiveWindows([monster("25:00", 200, "BARON_NASHOR")], 100, clock("35:00"));
    expect(windows.find((w) => w.kind === "herald")).toMatchObject({
      spawnsAt: clock("15:00"),
      takenAt: null,
      endsAt: clock("19:45"),
    });
    expect(windows.filter((w) => w.kind === "baron")).toEqual([
      { kind: "baron", spawnsAt: clock("20:00"), takenAt: clock("25:00"), ours: false, endsAt: clock("25:00") },
      { kind: "baron", spawnsAt: clock("31:00"), takenAt: null, ours: null, endsAt: clock("35:00") },
    ]);
  });

  it("leaves out monsters that hadn't spawned when the game ended", () => {
    const windows = objectiveWindows([], 100, clock("17:00"));
    expect(windows.map((w) => w.kind)).toEqual(["dragon", "grubs", "herald"]);
    expect(windows.find((w) => w.kind === "herald")!.endsAt).toBe(clock("17:00"));
  });
});

describe("describeTempo", () => {
  const minute = (overrides: Partial<TempoMinute> = {}): TempoMinute => {
    const jungler = {
      participantId: ME,
      alive: true,
      respawnAt: null,
      level: 7,
      gold: 3000,
      itemGold: 2350,
      unspentGold: 650,
      lastShop: clock("6:10"),
      cs: 60,
      position: null,
    };
    return {
      timestamp: clock("8:00"),
      tone: "ahead",
      // 1,050 more spent on items and a level up.
      lead: 1050 + LEVEL_GOLD,
      you: jungler,
      them: { ...jungler, participantId: ENEMY, level: 6, itemGold: 1300, unspentGold: 1240, lastShop: clock("3:41") },
      alive: { ours: 5, theirs: 5 },
      ...overrides,
    };
  };

  it("names who was up tempo and why", () => {
    expect(describeTempo(minute(), { them: "Lee Sin" })).toEqual({
      title: "You were up tempo",
      reasons: [
        "You'd spent 2,350 gold on items, Lee Sin 1,300 gold: 1,050 gold ahead.",
        `You were level 7, Lee Sin level 6: counts as ${gold(LEVEL_GOLD)} ahead.`,
        `All together: ${gold(1050 + LEVEL_GOLD)} ahead (up tempo from ${gold(TEMPO_LEAD)}).`,
        `Lee Sin was holding 1,240 gold not spent yet, last shopped at 3:41.`,
      ],
    });
  });

  it("leads with deaths and mentions uneven numbers", () => {
    const m = minute({
      tone: "behind",
      you: { ...minute().you, alive: false, respawnAt: clock("8:21") },
      alive: { ours: 4, theirs: 5 },
    });
    const { title, reasons } = describeTempo(m, { them: "Lee Sin" });
    expect(title).toBe("Lee Sin was up tempo");
    expect(reasons[0]).toBe("You were dead until 8:21.");
    expect(reasons).toContain(
      `Players alive: 4 on your team, 5 on theirs: counts as ${gold(PLAYER_GOLD)} behind.`,
    );
    // Being the only one alive decided it, so there's no total.
    expect(reasons.some((r) => r.startsWith("All together"))).toBe(false);
  });

  it("says when items are level and leaves out small amounts of unspent gold", () => {
    const m = minute({
      tone: "even",
      lead: 0,
      them: { ...minute().you, participantId: ENEMY, unspentGold: HOLDING_GOLD - 1 },
    });
    expect(describeTempo(m, { them: "Lee Sin" })).toEqual({
      title: "Even tempo",
      reasons: [
        "You'd both spent 2,350 gold on items.",
        `All together: even, short of the ${gold(TEMPO_LEAD)} that counts as up tempo.`,
      ],
    });
  });

  it("gives the lead short of the bar as a number", () => {
    const { reasons } = describeTempo(minute({ tone: "even", lead: -(TEMPO_LEAD - 50) }), {
      them: "Lee Sin",
    });
    expect(reasons).toContain(
      `All together: ${gold(TEMPO_LEAD - 50)} behind, short of the ${gold(TEMPO_LEAD)} that counts as up tempo.`,
    );
  });
});

// 2350 -> "2,350 gold", as describeTempo writes it.
function gold(amount: number): string {
  return `${amount.toLocaleString("en-US")} gold`;
}
