// Rough areas of Summoner's Rift, used to tell a gank in your lane from
// getting caught somewhere else.
//
// Map coordinates run from about (0, 0) at the blue fountain (bottom left) to
// (14900, 14900) at the red fountain (top right). Top lane runs up the left
// edge and along the top, bottom lane along the bottom and up the right edge,
// and mid lane is the diagonal between the bases. Everything else is jungle
// or river. The boundaries are generous on purpose: fights spill out of lanes.

import type { MapPosition } from "@/lib/riot/types";

export type MapArea = "top" | "mid" | "bot" | "base" | "jungle";

const BASE_SIZE = 4000; // each base is roughly a 4000 x 4000 corner
const MAP_SIZE = 14900;
const SIDE_LANE_WIDTH = 2600; // distance from the map edge
const MID_LANE_WIDTH = 1800; // distance from the diagonal, |x - y|

export function mapArea({ x, y }: MapPosition): MapArea {
  const inBlueBase = x < BASE_SIZE && y < BASE_SIZE;
  const inRedBase = x > MAP_SIZE - BASE_SIZE && y > MAP_SIZE - BASE_SIZE;
  if (inBlueBase || inRedBase) return "base";
  if (x < SIDE_LANE_WIDTH || y > MAP_SIZE - SIDE_LANE_WIDTH) return "top";
  if (y < SIDE_LANE_WIDTH || x > MAP_SIZE - SIDE_LANE_WIDTH) return "bot";
  if (Math.abs(x - y) < MID_LANE_WIDTH) return "mid";
  return "jungle";
}

// The lane a position plays in, or null for junglers.
export function laneOf(position: string): "top" | "mid" | "bot" | null {
  switch (position) {
    case "TOP":
      return "top";
    case "MIDDLE":
      return "mid";
    case "BOTTOM":
    case "UTILITY":
      return "bot";
    default:
      return null;
  }
}

// Riot's laneType on tower and plate events, for each lane.
export const LANE_TYPES = { top: "TOP_LANE", mid: "MID_LANE", bot: "BOT_LANE" } as const;

// Distance either side of the river's center line that still counts as river.
// Wide enough to include the Dragon and Baron pits.
const RIVER_HALF_WIDTH = 1300;
// mapArea's mid lane is generous so that fights spilling out of lane still
// count, but that would put the raptor camps "in mid lane". For describing
// where a jungler stood, only the lane itself counts.
const MID_LANE_CORE = 1100;

// A short, plain description of a spot from one team's point of view, like
// "top lane", "your bot side jungle" or "river (top side)". Used for the
// jungle map's captions and screen-reader text.
//
// "Top side" is the half of the map above the mid lane diagonal (where top
// lane is), "bot side" the half below it. The river runs the other way,
// splitting each side into the blue team's jungle and the red team's.
export function describeSpot(position: MapPosition, myTeamId: number): string {
  const area = mapArea(position);
  const { x, y } = position;
  const blueHalf = x + y < MAP_SIZE;
  const mine = blueHalf === (myTeamId === 100);
  if (area === "base") return mine ? "your base" : "enemy base";
  const inMidCore = Math.abs(x - y) < MID_LANE_CORE;
  if (area === "top" || area === "bot" || (area === "mid" && inMidCore)) return `${area} lane`;
  const side = y > x ? "top side" : "bot side";
  if (Math.abs(x + y - MAP_SIZE) < RIVER_HALF_WIDTH) return `river (${side})`;
  return mine ? `your ${side} jungle` : `enemy ${side} jungle`;
}
