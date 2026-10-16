import { describe, expect, it } from "vitest";
import { gankLog, laneFights } from "./ganks";
import { jungleReplay } from "./jungle-replay";
import { frames, kill, participants, SPOTS } from "./test-fixtures";
import type { ChampionKill, TrimmedFrame } from "./trim";

// In the fixtures, blue is 1 Gnar (top), 2 Vi (jungle), 3 Ahri (mid),
// 4 Jinx (bot), 5 Thresh; red is 6 Darius, 7 Lee Sin (jungle), 8 Syndra,
// 9 Kai'Sa, 10 Nautilus.
const players = participants();

function log(events: ChampionKill[], timelineFrames: TrimmedFrame[] = frames(15)) {
  const replay = jungleReplay({ frames: timelineFrames, events }, players, players[1], players[6])!;
  return gankLog(replay, events, players);
}

const kills = (...events: ReturnType<typeof kill>[]) => events as ChampionKill[];

describe("gankLog", () => {
  it("logs a gank that got a kill, with who joined on each side", () => {
    const { yours, theirs } = log(kills(kill("4:10", 3, 8, [2], SPOTS.midLane)));
    expect(yours).toEqual([
      {
        timestamp: 250_000,
        lane: "mid",
        ganking: 2,
        defending: 1,
        kills: 1,
        deaths: 0,
        outcome: "kill",
        otherJungler: false,
        laneLead: 0,
      },
    ]);
    expect(theirs).toEqual([]);
  });

  it("logs a counter gank for both junglers, from each side's point of view", () => {
    const { yours, theirs } = log(
      kills(kill("6:00", 4, 9, [2], SPOTS.botLane), kill("6:05", 7, 2, [10], SPOTS.botLane)),
    );
    expect(yours).toHaveLength(1);
    expect(yours[0]).toMatchObject({
      lane: "bot",
      ganking: 2, // Vi and Jinx
      defending: 3, // Kai'Sa, Lee Sin and Nautilus
      kills: 1,
      deaths: 1,
      outcome: "trade",
      otherJungler: true,
    });
    expect(theirs[0]).toMatchObject({
      ganking: 3,
      defending: 2,
      outcome: "trade",
      otherJungler: true,
    });
  });

  it("calls it a death when only the ganking side died", () => {
    const { yours } = log(kills(kill("5:00", 8, 2, [], SPOTS.midLane)));
    expect(yours[0]).toMatchObject({ outcome: "death", kills: 0, deaths: 1 });
  });

  it("logs lane visits with no kill from the minute snapshots, once per visit", () => {
    const timeline = frames(15, (minute, id) => {
      if (id === 2 && (minute === 5 || minute === 6)) return { position: SPOTS.topLane };
      if (id === 2 && minute === 8) return { position: SPOTS.midLane };
      // Blue top is 1,000 gold ahead from minute 5.
      if (id === 1 && minute >= 5) return { gold: 1000 };
      return {};
    });
    // A kill in mid at 8:20 is the fight, so the 8:00 snapshot isn't a separate visit.
    const { yours, theirs } = log(kills(kill("8:20", 3, 8, [2], SPOTS.midLane)), timeline);
    expect(yours.map((g) => [g.timestamp / 60_000, g.lane, g.outcome])).toEqual([
      [5, "top", "no kill"],
      [8 + 1 / 3, "mid", "kill"],
    ]);
    expect(yours[0].laneLead).toBe(1000);
    expect(theirs).toEqual([]);
  });

  it("flips the lane lead for the enemy jungler", () => {
    const timeline = frames(15, (minute, id) => (id === 1 ? { gold: 1000 } : {}));
    const { theirs } = log(kills(kill("7:00", 7, 1, [6], SPOTS.topLane)), timeline);
    expect(theirs[0]).toMatchObject({ lane: "top", outcome: "kill", laneLead: -1000 });
  });
});

describe("laneFights", () => {
  it("skips kills outside lanes, before 1:30 and after 14:00, and splits fights 20s apart", () => {
    const fights = laneFights(
      kills(
        kill("1:20", 3, 8, [], SPOTS.midLane),
        kill("5:00", 2, 7, [], SPOTS.jungle),
        kill("6:00", 3, 8, [], SPOTS.midLane),
        kill("6:30", 8, 3, [], SPOTS.midLane),
        kill("14:30", 3, 8, [], SPOTS.midLane),
      ),
    );
    expect(fights.map((f) => [f.timestamp / 1000, f.kills.length])).toEqual([
      [360, 1],
      [390, 1],
    ]);
  });
});
