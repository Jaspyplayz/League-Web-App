import { describe, expect, it } from "vitest";
import type { MapPosition } from "@/lib/riot/types";
import type { JungleReplay, ReplayFrame } from "./jungle-replay";
import { laneSide, pathingVsLanes } from "./pathing";

describe("laneSide", () => {
  it.each([
    [{ x: 1500, y: 9000 }, "top"], // top lane
    [{ x: 4000, y: 8000 }, "top"], // blue's top side jungle
    [{ x: 5007, y: 10471 }, "top"], // Baron pit
    [{ x: 7400, y: 7300 }, "mid"],
    [{ x: 9866, y: 4414 }, "bot"], // Dragon pit
    [{ x: 11000, y: 7000 }, "bot"], // red's bot side jungle
    [{ x: 1000, y: 1000 }, null], // base
  ] as const)("puts %o near %s", (position, lane) => {
    expect(laneSide(position)).toBe(lane);
  });
});

const TOP_SIDE: MapPosition = { x: 4000, y: 8000 };
const BOT_SIDE: MapPosition = { x: 11000, y: 7000 };

// A replay where you (participant 2) stand at `spots[minute]` and the lane
// leads come from `leads(minute)`.
function replay(
  minutes: number,
  spot: (minute: number) => MapPosition | null,
  leads: (minute: number) => ReplayFrame["laneLeads"] = () => ({ top: 0, mid: 0, bot: 0 }),
): JungleReplay {
  const frames: ReplayFrame[] = [];
  for (let minute = 0; minute <= minutes; minute++) {
    const positions = Array<MapPosition | null>(10).fill(null);
    positions[1] = spot(minute);
    frames.push({
      timestamp: minute * 60_000,
      positions,
      kills: [],
      objectives: [],
      laneLeads: leads(minute),
    });
  }
  return { meId: 2, enemyJunglerId: 7, frames };
}

describe("pathingVsLanes", () => {
  it("covers minutes 3 to 14", () => {
    const result = pathingVsLanes(replay(30, () => TOP_SIDE));
    expect(result.minutes.map((m) => m.minute)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  });

  it("stops before the end-of-game frame in a short game", () => {
    // 15 frames after 0:00, but the last one is the end of the game.
    const result = pathingVsLanes(replay(14, () => TOP_SIDE));
    expect(result.minutes.at(-1)?.minute).toBe(13);
  });

  it("counts minutes near winning and losing lanes", () => {
    // Top is ahead all game, bot behind. You spend minutes 3-9 top side,
    // 10-12 bot side, and 13-14 in base.
    const result = pathingVsLanes(
      replay(
        30,
        (m) => (m <= 9 ? TOP_SIDE : m <= 12 ? BOT_SIDE : { x: 1000, y: 1000 }),
        () => ({ top: 1200, mid: 100, bot: -900 }),
      ),
    );
    expect(result.nearAhead).toBe(7);
    expect(result.nearBehind).toBe(3);
    expect(result.nearEven).toBe(0);
    expect(result.minutes[0]).toEqual({
      minute: 3,
      nearLane: "top",
      lanes: { top: "ahead", mid: "even", bot: "behind" },
    });
    expect(result.minutes.at(-1)?.nearLane).toBeNull();
  });

  it("skips minutes without a position", () => {
    const result = pathingVsLanes(replay(30, () => null));
    expect(result.nearAhead + result.nearBehind + result.nearEven).toBe(0);
  });
});
