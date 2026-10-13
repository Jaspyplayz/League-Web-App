// Early jungle pathing next to lane strength: for each minute from 3:00 to
// 14:00, which lane you were playing near and how that lane was doing.
//
// Good junglers tend to path toward lanes with gold and XP leads, but it's
// situational: ganking a losing lane can be right when you're up numbers. So
// this reports where you were and how each lane stood, not a grade.

import type { MapPosition } from "@/lib/riot/types";
import { laneTone, type JungleReplay, type Lane, type LaneTone } from "./jungle-replay";
import { mapArea } from "./map";

// The first clear usually ends around 3:00, and laning is mostly over by 14:00
// when the outer tower plates fall off.
export const PATHING_FROM_MINUTE = 3;
export const PATHING_TO_MINUTE = 14;

export type PathingMinute = {
  minute: number;
  // The lane you were playing near. Null in base or when Riot left your
  // position out.
  nearLane: Lane | null;
  // How each lane was doing for your team at that minute.
  lanes: Record<Lane, LaneTone>;
};

export type Pathing = {
  minutes: PathingMinute[];
  // How many of those minutes you spent near a lane that was ahead, behind or
  // even. Minutes in base (or without a position) aren't counted.
  nearAhead: number;
  nearBehind: number;
  nearEven: number;
};

// The lane a spot belongs to, from a jungler's point of view. Lanes count as
// themselves; jungle and river count toward the lane on their side of the
// map: above the mid lane diagonal is top side, below it bot side.
export function laneSide(position: MapPosition): Lane | null {
  const area = mapArea(position);
  if (area === "base") return null;
  if (area !== "jungle") return area;
  return position.y > position.x ? "top" : "bot";
}

export function pathingVsLanes(replay: JungleReplay): Pathing {
  const minutes: PathingMinute[] = [];
  // Frame i is minute i, except the last one, which is the end of the game.
  const lastWholeMinute = Math.min(PATHING_TO_MINUTE, replay.frames.length - 2);
  for (let minute = PATHING_FROM_MINUTE; minute <= lastWholeMinute; minute++) {
    const frame = replay.frames[minute];
    const position = frame.positions[replay.meId - 1];
    minutes.push({
      minute,
      nearLane: position ? laneSide(position) : null,
      lanes: {
        top: laneTone(frame.laneLeads.top),
        mid: laneTone(frame.laneLeads.mid),
        bot: laneTone(frame.laneLeads.bot),
      },
    });
  }

  const near = (tone: LaneTone) =>
    minutes.filter((m) => m.nearLane !== null && m.lanes[m.nearLane] === tone).length;
  return {
    minutes,
    nearAhead: near("ahead"),
    nearBehind: near("behind"),
    nearEven: near("even"),
  };
}
