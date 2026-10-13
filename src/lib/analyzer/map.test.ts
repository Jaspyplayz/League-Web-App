import { describe, expect, it } from "vitest";
import { laneOf, mapArea } from "./map";

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
