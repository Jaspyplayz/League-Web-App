import { describe, expect, it } from "vitest";
import { describeSpot, laneOf, mapArea } from "./map";

describe("mapArea", () => {
  it.each([
    [{ x: 1500, y: 9000 }, "top"], // left edge
    [{ x: 7000, y: 13800 }, "top"], // top edge
    [{ x: 7400, y: 7300 }, "mid"],
    [{ x: 10000, y: 1200 }, "bot"], // bottom edge
    [{ x: 13900, y: 6000 }, "bot"], // right edge
    [{ x: 4000, y: 8000 }, "jungle"],
    [{ x: 9800, y: 4400 }, "jungle"],
    [{ x: 1000, y: 1000 }, "base"],
    [{ x: 14000, y: 14000 }, "base"],
  ] as const)("puts %o in %s", (position, area) => {
    expect(mapArea(position)).toBe(area);
  });
});

describe("laneOf", () => {
  it("puts supports in bot lane and junglers in no lane", () => {
    expect(laneOf("UTILITY")).toBe("bot");
    expect(laneOf("MIDDLE")).toBe("mid");
    expect(laneOf("JUNGLE")).toBeNull();
    expect(laneOf("")).toBeNull();
  });
});

describe("describeSpot", () => {
  const BLUE = 100;
  const RED = 200;

  it("names lanes the same for both teams", () => {
    expect(describeSpot({ x: 1500, y: 9000 }, BLUE)).toBe("top lane");
    expect(describeSpot({ x: 1500, y: 9000 }, RED)).toBe("top lane");
  });

  it("tells your jungle from the enemy's", () => {
    // Blue team's top side jungle (between top lane and mid, below the river)
    expect(describeSpot({ x: 4000, y: 8000 }, BLUE)).toBe("your top side jungle");
    expect(describeSpot({ x: 4000, y: 8000 }, RED)).toBe("enemy top side jungle");
    // Red team's bot side jungle
    expect(describeSpot({ x: 11000, y: 7000 }, BLUE)).toBe("enemy bot side jungle");
  });

  it("puts the raptor camps in the jungle, not mid lane", () => {
    expect(describeSpot({ x: 7000, y: 5400 }, BLUE)).toBe("your bot side jungle");
    expect(describeSpot({ x: 8000, y: 9500 }, BLUE)).toBe("enemy top side jungle");
    expect(describeSpot({ x: 7400, y: 7300 }, BLUE)).toBe("mid lane");
  });

  it("puts the Dragon and Baron pits in the river", () => {
    expect(describeSpot({ x: 9866, y: 4414 }, BLUE)).toBe("river (bot side)");
    expect(describeSpot({ x: 5007, y: 10471 }, RED)).toBe("river (top side)");
  });

  it("names bases from your point of view", () => {
    expect(describeSpot({ x: 1000, y: 1000 }, BLUE)).toBe("your base");
    expect(describeSpot({ x: 1000, y: 1000 }, RED)).toBe("enemy base");
  });
});
