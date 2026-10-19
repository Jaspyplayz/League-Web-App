// Where each champion was at any second of the game, for the replay's map.
//
// Riot snapshots every champion's position once a minute. Between two
// snapshots, a few events say where someone was:
//   - a death, logged with its spot. The champion stays there until they're
//     back, which is where Riot's snapshots put a dead champion too.
//   - coming back after a death, and every visit to the shop (buying,
//     selling, undoing), which happen at their team's fountain.
//   - a kill they got or helped with, near its spot, and an epic monster
//     they took, at its pit.
// A champion's path joins those points by the shortest walk around the
// Rift's walls (rift.ts), at a steady pace from one point to the next, with
// two exceptions. A trip to the fountain (recalling, or coming back after a
// death) is a jump: they stay where they were until the moment they're
// there. And leaving the fountain, they walk to where they're seen next and
// wait there, instead of taking the whole time to get there. So positions
// are exact at the snapshots, deaths and fountain visits, and estimates in
// between. position-check.ts measures how far off (docs/replay.md).

import type { MapPosition } from "@/lib/riot/types";
import { RIFT_WALLS, walkingRoute, type Walls } from "./rift";
import type { DeathSpan } from "./tempo";
import type { TrimmedTimeline } from "./trim";

export type PathPoint = MapPosition & {
  at: number; // ms
  // True when they got here at once instead of walking: at the fountain
  // after recalling or dying. Until then they stay where they were.
  jump?: true;
};

// How a path is built, so the check can compare the ways.
export type PathOptions = {
  deaths: boolean; // death spots, and the fountain when they're back
  shop: boolean; // the fountain at every shop visit
  kills: boolean; // the spot of a kill they got or helped with
  monsters: boolean; // the pit of an epic monster they took
  // Leave out a kill or monster they couldn't have walked to from where they
  // were last seen, or from it to where they're seen next: a long-range
  // ultimate, or a shield from across the map.
  reachable: boolean;
  // How fast they walk out of the fountain, in map units per ms. Null to
  // spread the walk over the whole time until they're seen next.
  walkOut: number | null;
  // The walls they walk around, or null to walk in straight lines.
  walls: Walls | null;
};

// What the replay uses.
export const REPLAY_PATHS: PathOptions = {
  deaths: true,
  shop: true,
  kills: true,
  monsters: true,
  reachable: true,
  walkOut: 0.4,
  walls: RIFT_WALLS,
};

type Player = { participantId: number; teamId: number; championName: string };

type Source = "snapshot" | "death" | "respawn" | "shop" | "kill" | "monster";
type Point = PathPoint & { source: Source };

// When two points fall on the same millisecond, the first of these wins.
const PRIORITY: Source[] = ["death", "respawn", "snapshot", "shop", "kill", "monster"];

// Where a team's champions stand at the start, if the first snapshot is
// missing.
const FOUNTAINS: Record<number, MapPosition> = {
  100: { x: 560, y: 560 },
  200: { x: 14280, y: 14320 },
};

// The epic monsters' pits. Riot doesn't log where a monster died, but
// they don't move far from where they spawn. Atakhan has two possible pits,
// so he's left out.
const DRAGON_PIT = { x: 9866, y: 4414 };
const BARON_PIT = { x: 5007, y: 10471 };
export const MONSTER_PITS: Record<string, MapPosition> = {
  DRAGON: DRAGON_PIT,
  BARON_NASHOR: BARON_PIT,
  RIFTHERALD: BARON_PIT,
  HORDE: BARON_PIT,
};

// Ornn can buy items anywhere, so his purchases don't mean he's at the
// fountain.
const BUYS_ANYWHERE = new Set(["ornn"]);

// How fast and how far a champion can get, for `reachable` and for walking
// around walls: a little over a champion's walking speed with boots, plus
// room for a dash, a Flash and an ability's range.
const TOP_SPEED = 0.5; // map units per ms
const REACH = 1500; // map units

// A player's path through the game, in time order. `leaveOut` is a snapshot
// to skip, for the check.
export function positionPath(
  timeline: TrimmedTimeline,
  player: Player,
  deaths: DeathSpan[],
  options: PathOptions = REPLAY_PATHS,
  leaveOut?: number,
): PathPoint[] {
  const points = pathPoints(timeline, player, deaths, options, leaveOut);
  const kept = options.reachable ? points.filter((p, i) => canReach(points, i)) : points;
  const { walls } = options;
  const length = (from: MapPosition, to: MapPosition) =>
    walls ? walkingRoute(walls, from, to).length : distance(from, to);
  const walked = options.walkOut ? walkingOut(kept, options.walkOut, length) : kept;
  // The page only needs the spots, not where each came from.
  const path: PathPoint[] = withoutRepeats(walked).map(({ at, x, y, jump }) =>
    jump ? { at, x, y, jump } : { at, x, y },
  );
  return walls ? aroundWalls(path, walls) : path;
}

// Where a player was at moment t (ms), on their path. Every path starts at
// the fountain at 0:00, so there's always a point to start from.
export function positionAt(path: PathPoint[], t: number): MapPosition {
  // The last point at or before t, and the next one.
  const i = Math.max(0, path.findLastIndex((p) => p.at <= t));
  const from = path[i];
  const to = path[i + 1];
  // Before a jump they stay where they were.
  if (!to || to.jump || t <= from.at) return { x: from.x, y: from.y };
  const share = (t - from.at) / (to.at - from.at);
  return {
    x: Math.round(from.x + (to.x - from.x) * share),
    y: Math.round(from.y + (to.y - from.y) * share),
  };
}

function pathPoints(
  { frames, events }: TrimmedTimeline,
  player: Player,
  deaths: DeathSpan[],
  options: PathOptions,
  leaveOut: number | undefined,
): Point[] {
  const id = player.participantId;
  const fountain =
    frames[0]?.players[id - 1]?.position ?? FOUNTAINS[player.teamId] ?? FOUNTAINS[100];
  const mine = deaths.filter((d) => d.participantId === id);
  const dead = (t: number) => mine.some((d) => d.diedAt <= t && t < d.respawnAt);
  const points: Point[] = [];
  const add = (at: number, position: MapPosition, source: Source) => {
    const jump = source === "respawn" || source === "shop";
    points.push({ at, x: position.x, y: position.y, ...(jump ? { jump: true } : {}), source });
  };

  frames.forEach((frame, i) => {
    const position = i === 0 ? fountain : frame.players[id - 1]?.position;
    if (!position || i === leaveOut) return;
    // While they're dead, Riot's snapshot is the spot they died, which the
    // death already adds.
    if (options.deaths && i > 0 && dead(frame.timestamp)) return;
    add(frame.timestamp, position, "snapshot");
  });

  if (options.deaths) {
    for (const e of events) {
      if (e.type === "CHAMPION_KILL" && e.victimId === id && e.position) {
        add(e.timestamp, e.position, "death");
      }
    }
    for (const d of mine) add(d.respawnAt, fountain, "respawn");
  }

  for (const e of events) {
    if (dead(e.timestamp)) continue;
    const shopping =
      (e.type === "ITEM_PURCHASED" || e.type === "ITEM_SOLD" || e.type === "ITEM_UNDO") &&
      e.participantId === id;
    if (options.shop && shopping && !BUYS_ANYWHERE.has(player.championName.toLowerCase())) {
      add(e.timestamp, fountain, "shop");
    }
    const tookPart =
      (e.type === "CHAMPION_KILL" || e.type === "ELITE_MONSTER_KILL") &&
      (e.killerId === id || e.assistingParticipantIds.includes(id));
    if (options.kills && tookPart && e.type === "CHAMPION_KILL" && e.position) {
      add(e.timestamp, e.position, "kill");
    }
    const pit = e.type === "ELITE_MONSTER_KILL" ? MONSTER_PITS[e.monsterType] : undefined;
    if (options.monsters && tookPart && pit) add(e.timestamp, pit, "monster");
  }

  // In time order, keeping one point per millisecond.
  points.sort((a, b) => a.at - b.at || PRIORITY.indexOf(a.source) - PRIORITY.indexOf(b.source));
  return points.filter((p, i) => i === 0 || p.at !== points[i - 1].at);
}

// Whether the point at `i` fits the certain points either side of it. Only
// kills and monsters can fail: the rest are where Riot says they were.
function canReach(points: Point[], i: number): boolean {
  const point = points[i];
  if (point.source !== "kill" && point.source !== "monster") return true;
  const certain = (p: Point) => p.source !== "kill" && p.source !== "monster";
  const before = points.slice(0, i).findLast(certain);
  const after = points.slice(i + 1).find(certain);
  const reachable = (from: Point, to: Point) => couldReach(from, to, to.at - from.at);
  // A jump to the fountain can follow from anywhere.
  return (!before || reachable(before, point)) && (!after || after.jump || reachable(point, after));
}

// Whether a champion could get from one spot to another in `ms`.
export function couldReach(from: MapPosition, to: MapPosition, ms: number): boolean {
  return distance(from, to) <= TOP_SPEED * ms + REACH;
}

// After each time at the fountain (the start of the game, a shop visit,
// coming back after a death), they walk at `speed` to the next point and wait
// there, rather than spreading the walk over the whole time until it. Riot's
// snapshots show players back in lane soon after they shop. `length` is how
// far the walk is.
function walkingOut(
  points: Point[],
  speed: number,
  length: (from: MapPosition, to: MapPosition) => number,
): Point[] {
  return points.flatMap((point, i) => {
    const next = points[i + 1];
    const atFountain = point.at === 0 || point.source === "shop" || point.source === "respawn";
    if (!atFountain || !next || next.jump) return [point];
    const arrival = Math.round(point.at + length(point, next) / speed);
    if (arrival <= point.at || arrival >= next.at) return [point];
    return [point, { ...next, at: arrival }];
  });
}

// Between two points, they walk around the walls in the way rather than
// through them: each corner of the route goes in the path, timed so they
// keep a steady pace all the way. When the way around is too far to walk in
// the time, they must have gone over the wall (a dash, a Flash or a jump),
// so that stretch stays straight.
function aroundWalls(path: PathPoint[], walls: Walls): PathPoint[] {
  return path.flatMap((point, i) => {
    const next = path[i + 1];
    if (!next || next.jump || next.at <= point.at) return [point];
    const { corners, length } = walkingRoute(walls, point, next);
    const ms = next.at - point.at;
    if (corners.length === 0 || length > TOP_SPEED * ms) return [point];
    let along = 0;
    let previous: MapPosition = point;
    const turns = corners.map((corner) => {
      along += distance(previous, corner);
      previous = corner;
      return { at: point.at + Math.round((ms * along) / length), x: corner.x, y: corner.y };
    });
    return [point, ...turns];
  });
}

// A run of points at the same spot (several purchases in one visit to the
// shop) only needs its first and last.
function withoutRepeats(points: Point[]): Point[] {
  const same = (a: Point | undefined, b: Point) => a !== undefined && a.x === b.x && a.y === b.y;
  return points.filter((p, i) => !(same(points[i - 1], p) && same(points[i + 1], p)));
}

export function distance(a: MapPosition, b: MapPosition): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
