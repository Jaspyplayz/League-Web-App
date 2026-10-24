import { describe, expect, it } from "vitest";
import { findDeaths } from "./deaths";
import { clock, frames, kill, participants, SPOTS } from "./test-fixtures";
import type { TrimmedEvent } from "./trim";
import { findSwings, findTurningPoints, type TurningPointContext } from "./turning-points";

describe("findSwings", () => {
  it("ignores small changes", () => {
    expect(findSwings([0, 100, 200, 300, 400, 500, 600])).toEqual([]);
  });

  it("finds a sudden drop and trims the quiet minutes around it", () => {
    const diffs = [0, 0, 100, 100, -700, -700, -700, -700];
    expect(findSwings(diffs)).toEqual([{ start: 3, end: 4, swing: -800 }]);
  });

  it("finds a slower swing spread over up to four minutes", () => {
    const diffs = [0, -250, -500, -750, -1000, -1000];
    expect(findSwings(diffs)).toEqual([{ start: 0, end: 4, swing: -1000 }]);
  });

  it("keeps the three biggest swings that don't overlap, in game order", () => {
    const diffs = [0, -1000, -1000, 0, 0, -900, -900, 1100, 1100, 300, 300];
    expect(findSwings(diffs)).toEqual([
      { start: 0, end: 1, swing: -1000 },
      { start: 2, end: 3, swing: 1000 },
      { start: 6, end: 7, swing: 2000 },
    ]);
  });
});

// Mid lane, Ahri (3) vs Syndra (8). Even until 8 minutes, then Syndra and
// Lee Sin (7) gank Ahri at 8:10 and Syndra pulls 1000 gold ahead. At 14:30
// Ahri solo kills Syndra and gets 1200 back.
const players = participants();
const goldDiff = (minute: number) => (minute <= 8 ? 0 : minute <= 14 ? -1000 : 200);
const game = frames(20, (minute, id) => ({
  gold: id === 3 ? 400 * minute + goldDiff(minute) : 400 * minute,
}));
const events: TrimmedEvent[] = [
  kill("8:10", 7, 3, [8], SPOTS.midLane),
  { type: "TURRET_PLATE_DESTROYED", timestamp: clock("8:40"), teamId: 100, laneType: "MID_LANE" },
  kill("14:30", 3, 8, [], SPOTS.midLane),
];

function context(): TurningPointContext {
  const me = players[2];
  const opponent = players[7];
  return {
    frames: game,
    events,
    me,
    opponent,
    participants: players,
    deaths: findDeaths(events, { me, opponent, participants: players }),
    name: (id) => ({ 3: "Ahri", 7: "Lee Sin", 8: "Syndra" })[id] ?? "Someone",
  };
}

describe("findTurningPoints", () => {
  const points = findTurningPoints(context());

  it("finds both swings", () => {
    expect(points.map((p) => p.swing)).toEqual([-1000, 1200]);
  });

  it("explains a gank in plain words", () => {
    expect(points[0]).toMatchObject({
      timestamp: clock("8:10"),
      title: "Died to a gank",
      detail:
        "Lee Sin and Syndra ganked you in your lane. You lost 1 tower plate. " +
        "You went from 0 to −1,000 gold against Syndra between 8:00 and 9:00.",
    });
  });

  it("explains a solo kill", () => {
    expect(points[1]).toMatchObject({
      timestamp: clock("14:30"),
      title: "Solo killed Syndra",
      detail:
        "You killed Syndra one on one. " +
        "You went from −1,000 to +200 gold against Syndra between 14:00 and 15:00.",
    });
  });

  it("says when a swing came from somewhere other than kills", () => {
    const quiet = { ...context(), events: [], deaths: [] };
    expect(findTurningPoints(quiet)[0]).toMatchObject({
      title: "Syndra pulled ahead",
      detail: expect.stringContaining("No deaths here"),
    });
  });
});

// One death at 8:10 that costs `meId` 1000 gold against `opponentId` by 9:00.
function swingFromDeath(meId: number, opponentId: number, death: TrimmedEvent) {
  const me = players[meId - 1];
  const opponent = players[opponentId - 1];
  const deathEvents = [death];
  const [point] = findTurningPoints({
    frames: frames(12, (minute, id) => ({
      gold: id === meId && minute > 8 ? 400 * minute - 1000 : 400 * minute,
    })),
    events: deathEvents,
    me,
    opponent,
    participants: players,
    deaths: findDeaths(deathEvents, { me, opponent, participants: players }),
    name: (id) =>
      ({ 3: "Ahri", 4: "Jinx", 5: "Thresh", 8: "Syndra", 9: "Kai'Sa", 10: "Nautilus" })[id] ??
      "Someone",
  });
  return point;
}

describe("findTurningPoints, a death in lane", () => {
  it("names the support who killed you alone in bot lane, not your lane opponent", () => {
    // Blue Jinx (4) against red Kai'Sa (9); only Nautilus (10) gets the kill.
    const point = swingFromDeath(4, 9, kill("8:10", 10, 4, [], SPOTS.botLane));
    expect(point.title).toBe("Lost a 1v1 to Nautilus");
    expect(point.detail).toBe(
      "Nautilus killed you one on one. " +
        "You went from 0 to −1,000 gold against Kai'Sa between 8:00 and 9:00.",
    );
  });

  it("still names your lane opponent when they killed you alone in mid", () => {
    const point = swingFromDeath(3, 8, kill("8:10", 8, 3, [], SPOTS.midLane));
    expect(point.title).toBe("Lost a 1v1 to Syndra");
    expect(point.detail).toMatch(/^Syndra killed you one on one\./);
  });

  it("names both enemy bot laners in a 2v2", () => {
    const point = swingFromDeath(4, 9, kill("8:10", 9, 4, [10], SPOTS.botLane));
    expect(point.title).toBe("Lost a 2v2 in lane");
    expect(point.detail).toMatch(/^Kai'Sa and Nautilus killed you in a 2v2\./);
  });
});
