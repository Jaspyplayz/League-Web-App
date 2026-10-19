import { describe, expect, it } from "vitest";
import type { MapPosition } from "@/lib/riot/types";
import {
  cellIndex,
  countPositions,
  decodeCounts,
  decodeWalls,
  encodeCounts,
  encodeWalls,
  isOpenLine,
  RIFT_CELLS,
  RIFT_WALLS,
  walkingRoute,
  wallOutline,
  wallsFromCounts,
  type Walls,
} from "./rift";
import { cellsIn, frames, kill, mapWith, type Block } from "./test-fixtures";

const isWall = (walls: Walls, position: MapPosition) => walls[cellIndex(position)] === 0;
const distance = (a: MapPosition, b: MapPosition) => Math.hypot(a.x - b.x, a.y - b.y);

// A wall from the bottom edge of the map up to y = 4,000, 200 wide.
const WALL = { x: [2000, 2200], y: [0, 4000] } satisfies Block;

describe("countPositions, encodeCounts and decodeCounts", () => {
  it("counts every snapshot and kill position in its cell, and writes counts as text", () => {
    const snapshots = frames(2, (minute, id) => ({
      position: { x: 150 + 100 * id, y: 50 + 100 * minute },
    }));
    const counts = countPositions([
      { frames: snapshots, events: [kill("1:30", 1, 6, [], { x: 1234, y: 5678 })] },
    ]);
    expect(counts.reduce((sum, n) => sum + n, 0)).toBe(31);
    expect(counts[cellIndex({ x: 250, y: 150 })]).toBe(1);
    expect(counts[cellIndex({ x: 1234, y: 5678 })]).toBe(1);

    // One character per cell, so anything over 35 is written as 35.
    counts[0] = 99;
    const rows = encodeCounts(counts);
    expect(rows).toHaveLength(RIFT_CELLS);
    expect(rows[0][0]).toBe("z");
    expect(decodeCounts(rows)[0]).toBe(35);
    expect(decodeCounts(rows).slice(1)).toEqual(counts.slice(1));
  });
});

describe("wallsFromCounts", () => {
  it("opens cells where at least 3 positions fell, then cleans up small patches", () => {
    const counts: number[] = new Array(RIFT_CELLS * RIFT_CELLS).fill(20);
    const quiet = { x: [1000, 1300], y: [1000, 1300] } satisfies Block; // 9 cells
    const busier = { x: [3000, 3300], y: [3000, 3300] } satisfies Block;
    const hole = { x: [5000, 5200], y: [5000, 5100] } satisfies Block; // 2 cells
    const wall = { x: [7000, 8000], y: [7000, 8000] } satisfies Block;
    const island = { x: [7400, 7500], y: [7400, 7600] } satisfies Block; // 2 cells
    for (const cell of cellsIn(quiet)) counts[cell] = 2;
    for (const cell of cellsIn(busier)) counts[cell] = 3;
    for (const cell of cellsIn(hole)) counts[cell] = 0;
    for (const cell of cellsIn(wall)) counts[cell] = 0;
    for (const cell of cellsIn(island)) counts[cell] = 30;

    const walls = wallsFromCounts(counts);
    expect(isWall(walls, { x: 1150, y: 1150 })).toBe(true);
    expect(isWall(walls, { x: 3150, y: 3150 })).toBe(false);
    // A couple of cells nobody happened to stand in aren't a wall...
    expect(isWall(walls, { x: 5050, y: 5050 })).toBe(false);
    // ...and a couple of cells of positions inside a wall aren't a path.
    expect(isWall(walls, { x: 7450, y: 7450 })).toBe(true);
    expect(isWall(walls, { x: 7050, y: 7050 })).toBe(true);
  });
});

describe("encodeWalls and decodeWalls", () => {
  it("writes the walls as text with the red side's edge first, and reads them back", () => {
    const walls = mapWith({ x: [0, 100], y: [14900, 15000] });
    const rows = encodeWalls(walls);
    expect(rows[0]).toBe(`#${".".repeat(RIFT_CELLS - 1)}`);
    expect(rows[1]).toBe(".".repeat(RIFT_CELLS));
    expect(decodeWalls(rows)).toEqual(walls);
  });

  it("loads this season's walls: the lanes and river are open, the jungle has walls", () => {
    const open = RIFT_WALLS.reduce((sum, cell) => sum + cell, 0);
    expect(open / RIFT_WALLS.length).toBeGreaterThan(0.5);
    expect(open / RIFT_WALLS.length).toBeLessThan(0.8);
    // Mid lane's middle, where it crosses the river.
    expect(isWall(RIFT_WALLS, { x: 7400, y: 7400 })).toBe(false);
  });
});

describe("isOpenLine", () => {
  it("is false when a wall is in the way, ignoring the cells at either end", () => {
    const walls = mapWith(WALL);
    expect(isOpenLine(walls, { x: 1000, y: 1000 }, { x: 1000, y: 9000 })).toBe(true);
    expect(isOpenLine(walls, { x: 1000, y: 1000 }, { x: 3000, y: 1000 })).toBe(false);
    expect(isOpenLine(walls, { x: 1000, y: 5000 }, { x: 3000, y: 5000 })).toBe(true);
    // From a spot just inside the wall, they can still step out of it.
    expect(isOpenLine(walls, { x: 2150, y: 1000 }, { x: 3000, y: 1000 })).toBe(true);
  });
});

describe("walkingRoute", () => {
  it("is the straight line when nothing is in the way", () => {
    const route = walkingRoute(mapWith(WALL), { x: 1000, y: 1000 }, { x: 1000, y: 3000 });
    expect(route).toEqual({ corners: [], length: 2000 });
  });

  it("goes around a wall, turning only at its corners", () => {
    const walls = mapWith(WALL);
    const from = { x: 1000, y: 1000 };
    const to = { x: 3000, y: 1000 };
    const route = walkingRoute(walls, from, to);
    expect(route.corners).toEqual([
      { x: 1950, y: 4050 },
      { x: 2250, y: 4050 },
    ]);
    const points = [from, ...route.corners, to];
    for (let i = 1; i < points.length; i++) {
      expect(isOpenLine(walls, points[i - 1], points[i])).toBe(true);
    }
    expect(route.length).toBeCloseTo(
      distance(from, route.corners[0]) + 300 + distance(route.corners[1], to),
    );
  });

  it("starts from the nearest open ground when a spot is inside a wall", () => {
    const walls = mapWith(WALL);
    const route = walkingRoute(walls, { x: 2100, y: 2000 }, { x: 3000, y: 6000 });
    expect(route.corners.length).toBeGreaterThan(0);
    for (const corner of route.corners) expect(isWall(walls, corner)).toBe(false);
  });

  it("is the straight line when there's no way around", () => {
    const walls = mapWith({ x: [7000, 7200], y: [0, 15000] });
    expect(walkingRoute(walls, { x: 5000, y: 5000 }, { x: 9000, y: 5000 }).corners).toEqual([]);
  });
});

describe("wallOutline", () => {
  it("traces the edge of the ground and each wall, in SVG coordinates", () => {
    const outline = wallOutline(mapWith({ x: [6000, 7000], y: [12000, 13000] }));
    const loops = outline.split("Z").filter(Boolean);
    expect(loops).toHaveLength(2);
    // The wall's loop: around x 6,000 to 7,000, and with y flipped, around
    // 14,900 - 13,000 to 14,900 - 12,000.
    const numbers = (loop: string) => (loop.match(/-?\d+/g) ?? []).map(Number);
    const wall = numbers(loops.find((loop) => numbers(loop)[0] > 5000)!);
    const xs = wall.filter((_, i) => i % 2 === 0);
    const ys = wall.filter((_, i) => i % 2 === 1);
    expect(Math.min(...xs)).toBeGreaterThan(5800);
    expect(Math.max(...xs)).toBeLessThan(7200);
    expect(Math.min(...ys)).toBeGreaterThan(1700);
    expect(Math.max(...ys)).toBeLessThan(3100);
  });
});
