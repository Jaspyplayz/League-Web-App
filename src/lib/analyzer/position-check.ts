// The position check (docs/replay.md): how close the replay's map gets to
// where each champion really was. Riot's once-a-minute snapshots are the only
// positions known for certain, so the check leaves one out at a time,
// rebuilds the player's path from everything else, and measures how far the
// estimate at that moment is from the snapshot. With one snapshot left out,
// the estimate spans two minutes, while the replay's never spans more than
// one, so the replay is closer than this.
//
// It also checks the guesses the path is built on: that Riot puts a dead
// champion at the spot they died, that a shop visit means the fountain, and
// how near a kill's spot or a monster's pit its killer and helpers were.
// scripts/check-positions.ts runs it on the games saved for the item check.

import {
  couldReach,
  distance,
  MONSTER_PITS,
  positionAt,
  positionPath,
  REPLAY_PATHS,
  type PathOptions,
} from "./positions";
import { RIFT_WALLS } from "./rift";
import { deathSpans } from "./tempo";
import type { TrimmedTimeline } from "./trim";

const NOTHING: PathOptions = {
  deaths: false,
  shop: false,
  kills: false,
  monsters: false,
  reachable: false,
  walkOut: null,
  walls: null,
};
const SHOP: PathOptions = { ...NOTHING, deaths: true, shop: true };
const WALK: PathOptions = { ...SHOP, walkOut: 0.4 };
const REACHABLE: PathOptions = { ...WALK, kills: true, monsters: true, reachable: true };

// The ways of building a path the check compares. Each adds to the one
// before, except the walking speeds, which are tried side by side.
export const POSITION_VARIANTS: { label: string; options: PathOptions }[] = [
  { label: "Snapshots only", options: NOTHING },
  { label: "+ deaths", options: { ...NOTHING, deaths: true } },
  { label: "+ shop visits", options: SHOP },
  { label: "+ walking out of the fountain, 300 a second", options: { ...SHOP, walkOut: 0.3 } },
  { label: "+ walking out of the fountain, 350 a second", options: { ...SHOP, walkOut: 0.35 } },
  { label: "+ walking out of the fountain, 400 a second", options: WALK },
  { label: "+ walking out of the fountain, 450 a second", options: { ...SHOP, walkOut: 0.45 } },
  { label: "+ walking out of the fountain, 500 a second", options: { ...SHOP, walkOut: 0.5 } },
  { label: "400 a second, + kills they took part in", options: { ...WALK, kills: true } },
  { label: "+ epic monsters", options: { ...WALK, kills: true, monsters: true } },
  { label: "+ only what they could reach", options: REACHABLE },
  { label: "+ walking around walls", options: { ...REACHABLE, walls: RIFT_WALLS } },
];

// A kill or monster counts as next to a snapshot within this long of it.
const NEAR_SNAPSHOT_MS = 3_000;

export type PositionCheck = {
  // For each of POSITION_VARIANTS, how far each estimate was from the
  // snapshot it left out, in map units. `busy` only counts moments where the
  // player did something between the snapshots either side (died, came back,
  // shopped, took part in a kill or monster), the only moments where the
  // variants can differ.
  all: number[][];
  busy: number[][];
  // The replay's own way (REPLAY_PATHS), by role.
  byRole: Record<string, number[]>;
  // Snapshots taken while a player was dead by the death timer: exactly at
  // the spot they died, or somewhere else (back sooner than the timer).
  deadSnapshots: { atDeathSpot: number; elsewhere: number };
  // Shop events while alive, and the champions of those where the next
  // snapshot is too far from the fountain to have walked there in time.
  shopEvents: number;
  tooFarFromFountain: string[];
  // Kills and epic monsters within NEAR_SNAPSHOT_MS of a snapshot: how far
  // from the kill's spot (or the monster's pit) the killer and each helper
  // were in that snapshot.
  killers: number[];
  killHelpers: number[];
  monsterTakers: number[];
  // Points in each player's path as the replay builds it, and their size as
  // JSON, for how much the page sends.
  pathPoints: number[];
  pathBytes: number[];
};

export function checkPositions(
  timeline: TrimmedTimeline,
  players: { participantId: number; championName: string; teamPosition?: string }[],
): PositionCheck {
  const { frames, events } = timeline;
  const deaths = deathSpans(timeline);
  const check: PositionCheck = {
    all: POSITION_VARIANTS.map(() => []),
    busy: POSITION_VARIANTS.map(() => []),
    byRole: {},
    deadSnapshots: { atDeathSpot: 0, elsewhere: 0 },
    shopEvents: 0,
    tooFarFromFountain: [],
    killers: [],
    killHelpers: [],
    monsterTakers: [],
    pathPoints: [],
    pathBytes: [],
  };

  for (const p of players) {
    const id = p.participantId;
    // Riot numbers the blue side 1 to 5.
    const player = { participantId: id, teamId: id <= 5 ? 100 : 200, championName: p.championName };
    const at = (i: number) => frames[i].players[id - 1].position;
    const fountain = frames[0]?.players[id - 1].position;
    const deadAt = (t: number) =>
      deaths.find((d) => d.participantId === id && d.diedAt <= t && t < d.respawnAt);

    // Leave out each snapshot between the first and the last in turn.
    for (let i = 1; i < frames.length - 1; i++) {
      const truth = at(i);
      if (!truth) continue;
      const t = frames[i].timestamp;
      const full = positionPath(timeline, player, deaths, REPLAY_PATHS, i);
      const busy = full.some(
        (point) => point.at > frames[i - 1].timestamp && point.at < frames[i + 1].timestamp,
      );
      POSITION_VARIANTS.forEach(({ options }, v) => {
        const miss = distance(
          positionAt(positionPath(timeline, player, deaths, options, i), t),
          truth,
        );
        check.all[v].push(miss);
        if (busy) check.busy[v].push(miss);
      });
      const role = p.teamPosition || "no role";
      const miss = distance(positionAt(full, t), truth);
      check.byRole[role] = [...(check.byRole[role] ?? []), miss];
    }

    for (const d of deaths.filter((d) => d.participantId === id)) {
      const spot = events.find(
        (e) => e.type === "CHAMPION_KILL" && e.victimId === id && e.timestamp === d.diedAt,
      );
      if (spot?.type !== "CHAMPION_KILL" || !spot.position) continue;
      frames.forEach((frame, i) => {
        const position = at(i);
        if (!position || frame.timestamp <= d.diedAt || frame.timestamp >= d.respawnAt) return;
        if (distance(position, spot.position!) === 0) check.deadSnapshots.atDeathSpot++;
        else check.deadSnapshots.elsewhere++;
      });
    }

    for (const e of events) {
      const shopping =
        (e.type === "ITEM_PURCHASED" || e.type === "ITEM_SOLD" || e.type === "ITEM_UNDO") &&
        e.participantId === id;
      if (!shopping || deadAt(e.timestamp) || !fountain) continue;
      check.shopEvents++;
      const next = frames.findIndex((f) => f.timestamp > e.timestamp);
      const position = next === -1 ? null : at(next);
      if (!position || deadAt(frames[next].timestamp)) continue;
      if (!couldReach(fountain, position, frames[next].timestamp - e.timestamp)) {
        check.tooFarFromFountain.push(p.championName);
      }
    }

    check.pathPoints.push(positionPath(timeline, player, deaths).length);
    check.pathBytes.push(JSON.stringify(positionPath(timeline, player, deaths)).length);
  }

  // How far each killer and helper was from the spot, when a snapshot was
  // taken within a few seconds.
  for (const e of events) {
    if (e.type !== "CHAMPION_KILL" && e.type !== "ELITE_MONSTER_KILL") continue;
    const spot = e.type === "CHAMPION_KILL" ? e.position : MONSTER_PITS[e.monsterType];
    const i = frames.findIndex((f) => Math.abs(f.timestamp - e.timestamp) <= NEAR_SNAPSHOT_MS);
    if (!spot || i <= 0) continue;
    const away = (id: number) => {
      const alive = !deaths.some(
        (d) =>
          d.participantId === id &&
          d.diedAt <= frames[i].timestamp &&
          frames[i].timestamp < d.respawnAt,
      );
      const position = frames[i].players[id - 1]?.position;
      return alive && position ? [distance(position, spot)] : [];
    };
    if (e.type === "CHAMPION_KILL") {
      if (e.killerId > 0) check.killers.push(...away(e.killerId));
      for (const id of e.assistingParticipantIds) check.killHelpers.push(...away(id));
    } else {
      for (const id of [e.killerId, ...e.assistingParticipantIds]) {
        if (id > 0) check.monsterTakers.push(...away(id));
      }
    }
  }

  return check;
}
