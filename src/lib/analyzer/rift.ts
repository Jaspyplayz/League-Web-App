// Summoner's Rift's walls, learned from where champions stood.
//
// Riot doesn't publish the map's walls, but its once-a-minute snapshots
// never put a champion inside one. So counting where thousands of snapshots
// (and kills) fell, in cells of RIFT_CELL map units, shows the Rift as it is
// this season: lanes, jungle paths, camps and the river, with the walls
// where nobody ever stood. `npm run rift-map` counts the games saved for the
// tempo study and the item check (docs/replay.md).

import type { MapPosition } from "@/lib/riot/types";
import type { TrimmedTimeline } from "./trim";

export const RIFT_CELL = 100; // map units per cell
export const RIFT_CELLS = 150; // cells per side: the map is about 14,900 across

// The cell a position falls in, as an index into a RIFT_CELLS x RIFT_CELLS
// grid stored row by row from the bottom (blue side's) edge.
export function cellIndex({ x, y }: MapPosition): number {
  const column = Math.min(RIFT_CELLS - 1, Math.max(0, Math.floor(x / RIFT_CELL)));
  const row = Math.min(RIFT_CELLS - 1, Math.max(0, Math.floor(y / RIFT_CELL)));
  return row * RIFT_CELLS + column;
}

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
