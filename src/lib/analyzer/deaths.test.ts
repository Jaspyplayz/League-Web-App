import { describe, expect, it } from "vitest";
import type { ChampionKill } from "./trim";
import { findDeaths, labelDeath, enemiesInvolved, type DeathContext } from "./deaths";
import { kill, participants, SPOTS } from "./test-fixtures";

const players = participants();
// Blue side: 1 top, 2 jungle, 3 mid, 4 bot, 5 support.
// Red side: 6 top, 7 jungle, 8 mid, 9 bot, 10 support.
const context = (meId: number, opponentId: number | null): DeathContext => ({
  me: players[meId - 1],
  opponent: opponentId ? players[opponentId - 1] : null,
  participants: players,
});

function label(meId: number, opponentId: number | null, k: ChampionKill) {
  const ctx = context(meId, opponentId);
  return labelDeath(k, enemiesInvolved(k, ctx), ctx);
}

const asKill = (e: ReturnType<typeof kill>) => e as ChampionKill;

describe("labelDeath", () => {
  it("calls it solo when only your opponent was involved", () => {
    expect(label(3, 8, asKill(kill("6:00", 8, 3, [], SPOTS.midLane)))).toBe("solo");
  });

  it("calls it a gank when someone else joined in your lane", () => {
    expect(label(3, 8, asKill(kill("8:10", 7, 3, [8], SPOTS.midLane)))).toBe("gank");
    // The jungler alone, in your lane, is a gank too.
    expect(label(1, 6, asKill(kill("4:00", 7, 1, [], SPOTS.topLane)))).toBe("gank");
  });

  it("calls it caught when it happened away from your lane", () => {
    expect(label(3, 8, asKill(kill("12:00", 7, 3, [8], SPOTS.jungle)))).toBe("caught");
    // Junglers have no lane, so any small fight they lose is "caught".
    expect(label(2, 7, asKill(kill("5:00", 8, 2, [], SPOTS.midLane)))).toBe("caught");
  });

  it("counts both enemy bot laners as your lane opponents in bot lane", () => {
    expect(label(4, 9, asKill(kill("7:00", 9, 4, [10], SPOTS.botLane)))).toBe("lane");
    expect(label(5, 10, asKill(kill("7:00", 9, 5, [10], SPOTS.botLane)))).toBe("lane");
    expect(label(4, 9, asKill(kill("7:00", 9, 4, [7], SPOTS.botLane)))).toBe("gank");
  });

  it("calls it a teamfight with three or more enemies", () => {
    expect(label(3, 8, asKill(kill("20:00", 6, 3, [7, 8], SPOTS.midLane)))).toBe("teamfight");
  });

  it("calls it executed when no enemy champion got the kill", () => {
    expect(label(3, 8, asKill(kill("3:00", 0, 3, [], SPOTS.midLane)))).toBe("executed");
  });

  it("ignores teammates in the assist list", () => {
    const k = asKill(kill("9:00", 8, 3, [4], SPOTS.midLane));
    expect(enemiesInvolved(k, context(3, 8))).toEqual([8]);
  });
});

describe("findDeaths", () => {
  it("lists only your deaths and marks the early ones", () => {
    const events = [
      kill("8:10", 7, 3, [8], SPOTS.midLane),
      kill("9:00", 3, 8, [], SPOTS.midLane), // you killed your opponent
      kill("20:30", 6, 3, [7, 8, 9], SPOTS.jungle),
    ];
    expect(findDeaths(events, context(3, 8))).toEqual([
      { timestamp: 490_000, label: "gank", enemyIds: [7, 8], early: true },
      { timestamp: 1_230_000, label: "teamfight", enemyIds: [6, 7, 8, 9], early: false },
    ]);
  });
});
