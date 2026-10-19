import { describe, expect, it } from "vitest";
import { positionAt, positionPath, REPLAY_PATHS, type PathPoint } from "./positions";
import { deathSpans } from "./tempo";
import { clock, frames, kill } from "./test-fixtures";
import type { TrimmedEvent } from "./trim";

const FOUNTAIN = { x: 500, y: 500 };
const DRAGON_PIT = { x: 9866, y: 4414 };

// The blue side's mid laner (participant 3) zigzags up the map: at
// (1000 × m, 1000) at odd minutes m and (1000 × m, 2000) at even ones.
const spot = (minute: number) =>
  minute === 0 ? FOUNTAIN : { x: 1000 * minute, y: minute % 2 ? 1000 : 2000 };
const snapshots = frames(10, (minute) => ({ position: spot(minute) }));
const MID = { participantId: 3, teamId: 100, championName: "Ahri" };

const purchase = (at: string, participantId = 3): TrimmedEvent => ({
  type: "ITEM_PURCHASED",
  timestamp: clock(at),
  participantId,
  itemId: 1056,
});
const dragon = (at: string, killerId: number, assists: number[] = []): TrimmedEvent => ({
  type: "ELITE_MONSTER_KILL",
  timestamp: clock(at),
  killerTeamId: 100,
  monsterType: "DRAGON",
  monsterSubType: "FIRE_DRAGON",
  killerId,
  assistingParticipantIds: assists,
});

function path(events: TrimmedEvent[], player = MID, sources = REPLAY_PATHS, leaveOut?: number) {
  const timeline = { frames: snapshots, events };
  return positionPath(timeline, player, deathSpans(timeline), sources, leaveOut);
}
// Where participant 3 is at a moment given as "m:ss", or in ms.
const where = (route: PathPoint[], at: string | number) =>
  positionAt(route, typeof at === "number" ? at : clock(at));

describe("positionPath and positionAt", () => {
  it("walks out of the fountain at the start, then in a straight line between snapshots", () => {
    const route = path([]);
    expect(where(route, "0:00")).toEqual(FOUNTAIN);
    // The 1:00 spot is 707 away, under 2 seconds' walk, so they're there
    // long before 1:00.
    expect(where(route, "0:30")).toEqual({ x: 1000, y: 1000 });
    expect(where(route, "1:30")).toEqual({ x: 1500, y: 1500 });
    expect(where(route, "2:00")).toEqual({ x: 2000, y: 2000 });
    // After the last snapshot, they stay there.
    expect(where(route, "12:00")).toEqual({ x: 10000, y: 2000 });
  });

  it("walks to where they died, stays there while dead, then is back at the fountain", () => {
    // Level 1 before 15:00, so the death timer is 10 seconds: back at 5:05.
    const route = path([kill("4:55", 8, 3, [], { x: 4800, y: 1600 })]);
    expect(where(route, "4:55")).toEqual({ x: 4800, y: 1600 });
    // The 5:00 snapshot is the spot they died, in Riot's data, so it's
    // skipped even when it says something else.
    expect(where(route, "5:00")).toEqual({ x: 4800, y: 1600 });
    expect(where(route, clock("5:05") - 1)).toEqual({ x: 4800, y: 1600 });
    expect(where(route, "5:05")).toEqual(FOUNTAIN);
    // Then they walk to the 6:00 spot, 5,701 away, at 400 a second, and
    // wait there.
    expect(where(route, clock("5:12") + 126)).toEqual({ x: 3250, y: 1250 });
    expect(where(route, "5:30")).toEqual({ x: 6000, y: 2000 });
    expect(where(route, "6:00")).toEqual({ x: 6000, y: 2000 });
  });

  it("stays put until a shop visit, then walks out of the fountain after the last purchase", () => {
    const route = path([purchase("6:30"), purchase("6:32"), purchase("6:35")]);
    expect(where(route, clock("6:30") - 1)).toEqual({ x: 6000, y: 2000 });
    expect(where(route, "6:30")).toEqual(FOUNTAIN);
    expect(where(route, "6:34")).toEqual(FOUNTAIN);
    // The 7:00 spot is 6,519 away: 16.3 seconds at 400 a second.
    expect(where(route, clock("6:43") + 149)).toEqual({ x: 3750, y: 750 });
    expect(where(route, "6:55")).toEqual({ x: 7000, y: 1000 });
    // One visit needs only its first and last purchase.
    expect(route.filter((p) => p.x === FOUNTAIN.x && p.at > 0)).toEqual([
      { at: clock("6:30"), ...FOUNTAIN, jump: true },
      { at: clock("6:35"), ...FOUNTAIN, jump: true },
    ]);
  });

  it("walks in a straight line when there isn't time to get there any faster", () => {
    // 10 seconds to cover 6,519, which takes 16.3 at 400 a second.
    expect(where(path([purchase("6:50")]), "6:55")).toEqual({ x: 3750, y: 750 });
  });

  it("can spread the walk out of the fountain over the time until they're seen next", () => {
    const route = path([purchase("6:30")], MID, { ...REPLAY_PATHS, walkOut: null });
    expect(where(route, "6:45")).toEqual({ x: 3750, y: 750 });
  });

  it("doesn't send them to the fountain for shopping while dead, or for Ornn, who can buy anywhere", () => {
    const whileDead = path([kill("4:55", 8, 3, [], { x: 4800, y: 1600 }), purchase("5:00")]);
    expect(where(whileDead, "5:00")).toEqual({ x: 4800, y: 1600 });
    const ornn = path([purchase("6:40")], { ...MID, championName: "Ornn" });
    expect(where(ornn, "6:40")).not.toEqual(FOUNTAIN);
  });

  it("puts them at a kill they got or helped with, and at the pit of an epic monster they took", () => {
    const route = path([kill("2:30", 3, 8, [], { x: 1000, y: 4000 }), dragon("8:30", 2, [3])]);
    expect(where(route, "2:15")).toEqual({ x: 1500, y: 3000 });
    expect(where(route, "2:30")).toEqual({ x: 1000, y: 4000 });
    expect(where(route, "8:30")).toEqual(DRAGON_PIT);
    // A kill they had nothing to do with changes nothing.
    expect(where(path([kill("2:30", 2, 8, [4], { x: 1000, y: 4000 })]), "2:30")).toEqual({
      x: 2500,
      y: 1500,
    });
  });

  it("leaves out a kill they couldn't have walked to, like an assist from across the map", () => {
    // Back at the fountain at 5:05, then an assist on the far side 3
    // seconds later.
    const events = [
      kill("4:55", 8, 3, [], { x: 4800, y: 1600 }),
      kill("5:08", 2, 9, [3], { x: 13000, y: 13000 }),
    ];
    // Walking out of the fountain towards the 6:00 snapshot instead.
    expect(where(path(events), "5:08")).toEqual({ x: 1658, y: 816 });
    const everything = { ...REPLAY_PATHS, reachable: false };
    expect(where(path(events, MID, everything), "5:08")).toEqual({ x: 13000, y: 13000 });
  });

  it("can leave out a snapshot, for the check", () => {
    expect(where(path([], MID, REPLAY_PATHS, 2), "2:00")).toEqual({ x: 2000, y: 1000 });
  });
});
