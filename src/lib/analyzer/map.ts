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
