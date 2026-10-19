// Summoner's Rift's walls, learned from where champions stood.
//
// Riot doesn't publish the map's walls, but its once-a-minute snapshots
// never put a champion inside one. So counting where thousands of snapshots
// (and kills) fell, in cells of RIFT_CELL map units, shows the Rift as it is
// this season: lanes, jungle paths, camps and the river, with the walls
// where nobody ever stood. `npm run rift-map` counts the games saved for the
// tempo study and the item check and saves the walls, and their outline for
// drawing, in rift-map.json (docs/replay.md).
//
// The replay's map draws the outline (RIFT_OUTLINE, in map-background.tsx)
// and walks champions around the walls (walkingRoute, in positions.ts).

import type { MapPosition } from "@/lib/riot/types";
import { MAP_SIZE } from "./map";
import riftMap from "./rift-map.json";
import type { TrimmedTimeline } from "./trim";

export const RIFT_CELL = 100; // map units per cell
export const RIFT_CELLS = 150; // cells per side: the map is about 14,900 across

// Which cells a champion can stand in: 1 open, 0 wall. One byte per cell,
// row by row from the bottom (blue side's) edge.
export type Walls = Uint8Array;

// The cell a position falls in, as an index into the grid.
export function cellIndex({ x, y }: MapPosition): number {
  return cellRow(y) * RIFT_CELLS + cellColumn(x);
}

const cellColumn = (x: number) => Math.min(RIFT_CELLS - 1, Math.max(0, Math.floor(x / RIFT_CELL)));
const cellRow = (y: number) => Math.min(RIFT_CELLS - 1, Math.max(0, Math.floor(y / RIFT_CELL)));

function cellCenter(cell: number): MapPosition {
  return {
    x: ((cell % RIFT_CELLS) + 0.5) * RIFT_CELL,
    y: (Math.floor(cell / RIFT_CELLS) + 0.5) * RIFT_CELL,
  };
}

// --- Learning the walls ---

// How many snapshot and kill positions fell in each cell, over many games.
export function countPositions(timelines: TrimmedTimeline[]): number[] {
  const counts: number[] = new Array(RIFT_CELLS * RIFT_CELLS).fill(0);
  const add = (position: MapPosition | null | undefined) => {
    if (position) counts[cellIndex(position)]++;
  };
  for (const { frames, events } of timelines) {
    for (const frame of frames) frame.players.forEach((p) => add(p.position));
    for (const e of events) if (e.type === "CHAMPION_KILL") add(e.position);
  }
  return counts;
}

// Counts as text, one string per row from the bottom, one character per
// cell: 0-9 then a-z, so anything over 35 shows as z.
export function encodeCounts(counts: number[]): string[] {
  const rows: string[] = [];
  for (let row = 0; row < RIFT_CELLS; row++) {
    const cells = counts.slice(row * RIFT_CELLS, (row + 1) * RIFT_CELLS);
    rows.push(cells.map((n) => Math.min(35, n).toString(36)).join(""));
  }
  return rows;
}

export function decodeCounts(rows: string[]): number[] {
  return rows.flatMap((row) => [...row].map((c) => parseInt(c, 36)));
}

// A cell is open when at least this many positions fell in it. One or two
// can be a champion caught crossing a wall mid-dash, or Kayn walking
// through one. Tuned by eye on about 2,000 games: higher, and quiet corners
// of the jungle start turning into walls.
const MIN_POSITIONS = 3;
// Then two clean-ups, each a few cells across at most: a patch of wall
// boxed in by open ground is somewhere nobody happened to stand, and a
// patch of open ground cut off from the rest is champions caught inside a
// wall. Real walls and paths are bigger than this.
const SMALL_PATCH = 6;

export function wallsFromCounts(counts: number[]): Walls {
  const walls: Walls = new Uint8Array(counts.length);
  counts.forEach((n, cell) => (walls[cell] = n >= MIN_POSITIONS ? 1 : 0));
  // Open every small patch of wall, then close every small patch of open
  // ground, by flipping each patch of one kind smaller than SMALL_PATCH cells.
  for (const kind of [0, 1]) {
    for (const patch of patches(walls, kind)) {
      if (patch.length < SMALL_PATCH) for (const cell of patch) walls[cell] = 1 - kind;
    }
  }
  return walls;
}

// The connected groups of cells of one kind (open or wall), joined through
// their four sides. Cells beyond the grid's edge count as wall.
function patches(walls: Walls, kind: number): number[][] {
  const seen = new Uint8Array(walls.length);
  const groups: number[][] = [];
  for (let start = 0; start < walls.length; start++) {
    if (seen[start] || walls[start] !== kind) continue;
    const group = [start];
    seen[start] = 1;
    for (let i = 0; i < group.length; i++) {
      for (const next of sideNeighbours(group[i])) {
        if (!seen[next] && walls[next] === kind) {
          seen[next] = 1;
          group.push(next);
        }
      }
    }
    groups.push(group);
  }
  return groups;
}

function sideNeighbours(cell: number): number[] {
  const column = cell % RIFT_CELLS;
  const out: number[] = [];
  if (column > 0) out.push(cell - 1);
  if (column < RIFT_CELLS - 1) out.push(cell + 1);
  if (cell >= RIFT_CELLS) out.push(cell - RIFT_CELLS);
  if (cell < RIFT_CELLS * (RIFT_CELLS - 1)) out.push(cell + RIFT_CELLS);
  return out;
}

// The walls as text for rift-map.json: one string per row from the top
// (red side's) edge down, so it reads like the map, with # for a wall.
export function encodeWalls(walls: Walls): string[] {
  const rows: string[] = [];
  for (let row = RIFT_CELLS - 1; row >= 0; row--) {
    let text = "";
    for (let column = 0; column < RIFT_CELLS; column++) {
      text += walls[row * RIFT_CELLS + column] ? "." : "#";
    }
    rows.push(text);
  }
  return rows;
}

export function decodeWalls(rows: string[]): Walls {
  const walls: Walls = new Uint8Array(RIFT_CELLS * RIFT_CELLS);
  rows.forEach((text, i) => {
    const row = RIFT_CELLS - 1 - i;
    for (let column = 0; column < RIFT_CELLS; column++) {
      walls[row * RIFT_CELLS + column] = text[column] === "." ? 1 : 0;
    }
  });
  return walls;
}

// The Rift this season, as `npm run rift-map` last learned it, and the
// walls' outline for drawing.
export const RIFT_WALLS: Walls = decodeWalls(riftMap.rows);
export const RIFT_OUTLINE: string = riftMap.outline;

// --- Walking around them ---

export type Route = {
  // Where they turn on the way, not counting the start and end.
  corners: MapPosition[];
  length: number; // map units, start to end through the corners
};

// The shortest walk from one spot to another that doesn't cross a wall.
// Spots inside a wall (a position right against one) start and end from the
// nearest open cell. With no way through, it's the straight line.
export function walkingRoute(walls: Walls, from: MapPosition, to: MapPosition): Route {
  const corners = cornersBetween(walls, cellIndex(from), cellIndex(to), from, to);
  const points = [from, ...corners, to];
  let length = 0;
  for (let i = 1; i < points.length; i++) length += distance(points[i - 1], points[i]);
  return { corners, length };
}

// Routes are worked out once per pair of cells and remembered, since paths
// pass the same places over and over. A cap keeps a long-running server from
// remembering forever.
const remembered = new WeakMap<Walls, Map<string, MapPosition[]>>();
const REMEMBER_AT_MOST = 50_000;

function cornersBetween(
  walls: Walls,
  fromCell: number,
  toCell: number,
  from: MapPosition,
  to: MapPosition,
): MapPosition[] {
  if (fromCell === toCell || isOpenLine(walls, from, to)) return [];
  let memo = remembered.get(walls);
  if (!memo || memo.size > REMEMBER_AT_MOST) {
    memo = new Map();
    remembered.set(walls, memo);
  }
  const key = `${fromCell}-${toCell}`;
  const known = memo.get(key);
  if (known) return known;

  const start = nearestOpen(walls, fromCell);
  const goal = nearestOpen(walls, toCell);
  const cells = start === null || goal === null ? null : shortestCells(walls, start, goal);
  const corners = cells ? pullTight(walls, cells, from, to) : [];
  memo.set(key, corners);
  return corners;
}

// The shortest chain of cells between two open cells, stepping to any of
// the 8 cells around, and diagonally only when both cells beside the step
// are open, so it never cuts through a wall's corner. It's A* search: keep
// growing whichever unfinished chain looks shortest, counting what's left as
// if there were no walls.
function shortestCells(walls: Walls, start: number, goal: number): number[] | null {
  const n = walls.length;
  const cost = new Float64Array(n).fill(Infinity);
  const cameFrom = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  const queue = new CellQueue();
  const goalColumn = goal % RIFT_CELLS;
  const goalRow = Math.floor(goal / RIFT_CELLS);
  const guess = (cell: number) => {
    const dx = Math.abs((cell % RIFT_CELLS) - goalColumn);
    const dy = Math.abs(Math.floor(cell / RIFT_CELLS) - goalRow);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };

  cost[start] = 0;
  queue.push(start, guess(start));
  while (queue.size > 0) {
    const cell = queue.pop();
    if (cell === goal) break;
    if (done[cell]) continue;
    done[cell] = 1;
    const column = cell % RIFT_CELLS;
    const row = Math.floor(cell / RIFT_CELLS);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const c = column + dx;
        const r = row + dy;
        if (c < 0 || r < 0 || c >= RIFT_CELLS || r >= RIFT_CELLS) continue;
        const next = r * RIFT_CELLS + c;
        if (!walls[next] || done[next]) continue;
        // A diagonal step needs both cells beside it open.
        if (dx !== 0 && dy !== 0 && (!walls[row * RIFT_CELLS + c] || !walls[r * RIFT_CELLS + column])) {
          continue;
        }
        const step = dx !== 0 && dy !== 0 ? Math.SQRT2 : 1;
        if (cost[cell] + step < cost[next]) {
          cost[next] = cost[cell] + step;
          cameFrom[next] = cell;
          queue.push(next, cost[next] + guess(next));
        }
      }
    }
  }
  if (cost[goal] === Infinity) return null;
  const cells = [goal];
  while (cells[cells.length - 1] !== start) cells.push(cameFrom[cells[cells.length - 1]]);
  return cells.reverse();
}

// A chain of cells zigzags. Pulling it tight like a string keeps only the
// corners it has to go around: from where they are, head for the furthest
// cell on the chain they can see, and repeat until they can see the end.
function pullTight(walls: Walls, cells: number[], from: MapPosition, to: MapPosition): MapPosition[] {
  const corners: MapPosition[] = [];
  let here = from;
  let i = 0;
  while (!isOpenLine(walls, here, to) && i < cells.length - 1) {
    let furthest = i + 1;
    for (let j = cells.length - 1; j > i + 1; j--) {
      if (isOpenLine(walls, here, cellCenter(cells[j]))) {
        furthest = j;
        break;
      }
    }
    here = cellCenter(cells[furthest]);
    corners.push(here);
    i = furthest;
  }
  return corners;
}

// Whether a straight line between two spots stays out of walls. The cells
// at either end don't count, so a spot right against a wall can still see
// out. It visits every cell the line passes through, in order.
export function isOpenLine(walls: Walls, from: MapPosition, to: MapPosition): boolean {
  let column = cellColumn(from.x);
  let row = cellRow(from.y);
  const endColumn = cellColumn(to.x);
  const endRow = cellRow(to.y);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const stepX = Math.sign(dx);
  const stepY = Math.sign(dy);
  // How far along the line (0 to 1) it crosses into the next column or row,
  // and how far it goes between crossings.
  const nextEdge = (p: number, step: number) => (step > 0 ? Math.floor(p / RIFT_CELL) + 1 : Math.floor(p / RIFT_CELL)) * RIFT_CELL;
  let alongX = stepX === 0 ? Infinity : (nextEdge(from.x, stepX) - from.x) / dx;
  let alongY = stepY === 0 ? Infinity : (nextEdge(from.y, stepY) - from.y) / dy;
  const everyX = stepX === 0 ? Infinity : RIFT_CELL / Math.abs(dx);
  const everyY = stepY === 0 ? Infinity : RIFT_CELL / Math.abs(dy);

  while (column !== endColumn || row !== endRow) {
    if (alongX < alongY) {
      column += stepX;
      alongX += everyX;
    } else {
      row += stepY;
      alongY += everyY;
    }
    if (column < 0 || row < 0 || column >= RIFT_CELLS || row >= RIFT_CELLS) return false;
    if (column === endColumn && row === endRow) break;
    if (!walls[row * RIFT_CELLS + column]) return false;
  }
  return true;
}

// The open cell nearest to a cell, searching outwards ring by ring. Null if
// there's no open cell nearby (a spot deep inside a wall).
function nearestOpen(walls: Walls, cell: number): number | null {
  if (walls[cell]) return cell;
  const column = cell % RIFT_CELLS;
  const row = Math.floor(cell / RIFT_CELLS);
  for (let ring = 1; ring <= 10; ring++) {
    let best: number | null = null;
    let bestDistance = Infinity;
    for (let r = row - ring; r <= row + ring; r++) {
      for (let c = column - ring; c <= column + ring; c++) {
        if (Math.max(Math.abs(r - row), Math.abs(c - column)) !== ring) continue;
        if (c < 0 || r < 0 || c >= RIFT_CELLS || r >= RIFT_CELLS) continue;
        const d = Math.hypot(r - row, c - column);
        if (walls[r * RIFT_CELLS + c] && d < bestDistance) {
          best = r * RIFT_CELLS + c;
          bestDistance = d;
        }
      }
    }
    if (best !== null) return best;
  }
  return null;
}

// The open cells still to look at, cheapest first (a binary heap).
class CellQueue {
  private cells: number[] = [];
  private costs: number[] = [];

  get size() {
    return this.cells.length;
  }

  push(cell: number, cost: number) {
    this.cells.push(cell);
    this.costs.push(cost);
    let i = this.cells.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.costs[parent] <= this.costs[i]) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): number {
    const top = this.cells[0];
    const lastCell = this.cells.pop()!;
    const lastCost = this.costs.pop()!;
    if (this.cells.length > 0) {
      this.cells[0] = lastCell;
      this.costs[0] = lastCost;
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        const right = left + 1;
        let smallest = i;
        if (left < this.cells.length && this.costs[left] < this.costs[smallest]) smallest = left;
        if (right < this.cells.length && this.costs[right] < this.costs[smallest]) smallest = right;
        if (smallest === i) break;
        this.swap(i, smallest);
        i = smallest;
      }
    }
    return top;
  }

  private swap(a: number, b: number) {
    [this.cells[a], this.cells[b]] = [this.cells[b], this.cells[a]];
    [this.costs[a], this.costs[b]] = [this.costs[b], this.costs[a]];
  }
}

function distance(a: MapPosition, b: MapPosition): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// --- Drawing them ---

// The walls' outlines as SVG path data, in the maps' SVG coordinates (map
// units, with y flipped so the red side is at the top): one loop around the
// edge of the ground and one around each wall inside it. The grid is
// blurred a little first and traced where it's half wall ("marching
// squares"), so the outlines run smoothly instead of in 100-unit steps.
export function wallOutline(walls: Walls): string {
  // Wall amount at each cell's centre, blurred with its 8 neighbours. Beyond
  // the grid's edge is all wall, so the outline closes around the map.
  const size = RIFT_CELLS + 2;
  const wall = (c: number, r: number) =>
    c < 0 || r < 0 || c >= RIFT_CELLS || r >= RIFT_CELLS ? 1 : 1 - walls[r * RIFT_CELLS + c];
  const field = new Float64Array(size * size);
  for (let r = -1; r <= RIFT_CELLS; r++) {
    for (let c = -1; c <= RIFT_CELLS; c++) {
      let sum = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) sum += wall(c + dc, r + dr) * (dr === 0 ? 2 : 1) * (dc === 0 ? 2 : 1);
      }
      field[(r + 1) * size + (c + 1)] = sum / 16;
    }
  }

  // Each square between four cell centres crossed by the half-wall line
  // gives one or two pieces of outline, which are then joined end to end.
  const point = (c: number, r: number) => ({ x: (c - 0.5) * RIFT_CELL, y: (r - 0.5) * RIFT_CELL });
  const cross = (a: MapPosition, va: number, b: MapPosition, vb: number) => {
    const share = (0.5 - va) / (vb - va);
    return { x: a.x + (b.x - a.x) * share, y: a.y + (b.y - a.y) * share };
  };
  const pieces: [MapPosition, MapPosition][] = [];
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const corners = [point(c, r), point(c + 1, r), point(c + 1, r + 1), point(c, r + 1)];
      const values = [
        field[r * size + c],
        field[r * size + c + 1],
        field[(r + 1) * size + c + 1],
        field[(r + 1) * size + c],
      ];
      const crossings: MapPosition[] = [];
      for (let side = 0; side < 4; side++) {
        const a = values[side];
        const b = values[(side + 1) % 4];
        if (a >= 0.5 !== b >= 0.5) crossings.push(cross(corners[side], a, corners[(side + 1) % 4], b));
      }
      // Two crossings are one piece; four (opposite corners walls) are two.
      if (crossings.length === 2) pieces.push([crossings[0], crossings[1]]);
      if (crossings.length === 4) {
        pieces.push([crossings[0], crossings[1]]);
        pieces.push([crossings[2], crossings[3]]);
      }
    }
  }

  const key = (p: MapPosition) => `${Math.round(p.x * 10)},${Math.round(p.y * 10)}`;
  const byEnd = new Map<string, number[]>();
  pieces.forEach(([a, b], i) => {
    for (const p of [a, b]) byEnd.set(key(p), [...(byEnd.get(key(p)) ?? []), i]);
  });
  const used = new Uint8Array(pieces.length);
  const loops: MapPosition[][] = [];
  for (let first = 0; first < pieces.length; first++) {
    if (used[first]) continue;
    used[first] = 1;
    const loop = [pieces[first][0], pieces[first][1]];
    for (;;) {
      const end = loop[loop.length - 1];
      const next = (byEnd.get(key(end)) ?? []).find((i) => !used[i]);
      if (next === undefined) break;
      used[next] = 1;
      const [a, b] = pieces[next];
      loop.push(key(a) === key(end) ? b : a);
    }
    loops.push(loop);
  }

  return loops
    .map((loop) => simplify(loop, OUTLINE_TOLERANCE))
    .filter((loop) => loop.length >= 3)
    .map(
      (loop) =>
        `M${loop.map((p) => `${Math.round(p.x)} ${Math.round(MAP_SIZE - p.y)}`).join(" L")}Z`,
    )
    .join("");
}

// How far (map units) a simplified outline may stray from the traced one.
// The maps are about 420 pixels across, so one pixel is about 35 units.
const OUTLINE_TOLERANCE = 25;

// Drops points that are within `tolerance` map units of the line between
// their neighbours (Ramer-Douglas-Peucker), so outlines stay small.
function simplify(points: MapPosition[], tolerance: number): MapPosition[] {
  if (points.length < 3) return points;
  const [a, b] = [points[0], points[points.length - 1]];
  let furthest = 0;
  let furthestDistance = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = distanceToLine(points[i], a, b);
    if (d > furthestDistance) {
      furthest = i;
      furthestDistance = d;
    }
  }
  if (furthestDistance <= tolerance) return [a, b];
  return [
    ...simplify(points.slice(0, furthest + 1), tolerance).slice(0, -1),
    ...simplify(points.slice(furthest), tolerance),
  ];
}

function distanceToLine(p: MapPosition, a: MapPosition, b: MapPosition): number {
  const length = distance(a, b);
  if (length === 0) return distance(p, a);
  return Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / length;
}
