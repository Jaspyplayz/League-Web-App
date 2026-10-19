// The early gank log for junglers: every lane fight before 14:00 that a
// jungler took part in, for you and for the enemy jungler, with how many
// players joined on each side, how it ended and how the lane was doing.
//
// It shows the situation and doesn't grade the gank. Jasper (a Grandmaster
// jungler) pointed out that ganking a losing lane can be right when you're up
// numbers or have tracked the enemy jungler, so the numbers are laid out for
// the player to judge.
//
// What the data can and can't see: Riot logs every kill with its spot, so a
// gank that killed someone is exact. A gank where nobody died leaves no
// event, so those come from the once-a-minute position snapshots: a jungler
// standing in a lane at a snapshot, with no kill nearby. Short visits between
// snapshots are missed, and a jungler taking a wave counts as a visit.

import type { Participant } from "@/lib/riot/types";
import { inLane, mapArea } from "./map";
import type { JungleReplay, Lane } from "./jungle-replay";
import type { ChampionKill } from "./trim";

// Level 2 ganks land around 1:50, so start a little before. Lane fights
// earlier than this are laners trading at level 1.
export const GANKS_FROM_MS = 90_000;
export const GANKS_TO_MS = 14 * 60_000; // after that, lanes break up and group
// Kills this close together in the same lane are one fight.
const SAME_FIGHT_MS = 20_000;
// A snapshot in lane this close to a fight in that lane belongs to the fight.
const NEAR_FIGHT_MS = 45_000;

export type GankOutcome =
  | "kill" // only the lane's enemies died
  | "death" // only the ganking side died
  | "trade" // both sides lost someone
  | "no kill"; // seen in lane at a snapshot, nobody died

export type Gank = {
  timestamp: number;
  lane: Lane;
  // Distinct players on each side who got a kill, an assist or died. A
  // lower bound on who was there: someone who arrived and did nothing isn't
  // in the events. Zero for "no kill" visits.
  ganking: number;
  defending: number;
  // Champions that died on each side.
  kills: number;
  deaths: number;
  outcome: GankOutcome;
  // Did the other jungler take part, as a counter gank or by dying there?
  otherJungler: boolean;
  // The ganking team's gold + XP lead in that lane at the last snapshot
  // before the fight. Null when the lane can't be matched up.
  laneLead: number | null;
};

export type GankLog = { yours: Gank[]; theirs: Gank[] };

export function gankLog(
  replay: JungleReplay,
  kills: ChampionKill[],
  participants: Participant[],
): GankLog {
  const teamOf = new Map(participants.map((p) => [p.participantId, p.teamId]));
  const myTeam = teamOf.get(replay.meId)!;
  const fights = laneFights(kills);
  return {
    yours: junglerGanks(replay, fights, teamOf, replay.meId, replay.enemyJunglerId, myTeam),
    theirs: junglerGanks(replay, fights, teamOf, replay.enemyJunglerId, replay.meId, myTeam),
  };
}

type Fight = { timestamp: number; lane: Lane; kills: ChampionKill[] };

// Early kills in a lane, grouped into fights.
export function laneFights(kills: ChampionKill[]): Fight[] {
  const fights: Fight[] = [];
  for (const kill of [...kills].sort((a, b) => a.timestamp - b.timestamp)) {
    if (kill.timestamp < GANKS_FROM_MS || kill.timestamp > GANKS_TO_MS) continue;
    if (!kill.position || !inLane(kill.position)) continue;
    const lane = mapArea(kill.position) as Lane;
    const last = fights.at(-1);
    const lastKill = last?.kills.at(-1);
    if (
      last &&
      lastKill &&
      last.lane === lane &&
      kill.timestamp - lastKill.timestamp <= SAME_FIGHT_MS
    ) {
      last.kills.push(kill);
    } else {
      fights.push({ timestamp: kill.timestamp, lane, kills: [kill] });
    }
  }
  return fights;
}

function junglerGanks(
  replay: JungleReplay,
  fights: Fight[],
  teamOf: Map<number, number>,
  junglerId: number,
  otherJunglerId: number,
  myTeam: number,
): Gank[] {
  const team = teamOf.get(junglerId)!;
  // laneLeads are your team's; flip them for the enemy jungler.
  const sign = team === myTeam ? 1 : -1;
  const leadAt = (timestamp: number, lane: Lane) => {
    const frame = replay.frames.findLast((f) => f.timestamp <= timestamp);
    const lead = frame?.laneLeads[lane] ?? null;
    return lead === null ? null : lead * sign;
  };

  const ganks: Gank[] = fights
    .filter((f) => f.kills.some((k) => involved(k).includes(junglerId)))
    .map((f) => {
      const ids = new Set(f.kills.flatMap(involved));
      const onSide = (ganking: boolean) =>
        [...ids].filter((id) => (teamOf.get(id) === team) === ganking).length;
      const died = (ganking: boolean) =>
        f.kills.filter((k) => (teamOf.get(k.victimId) === team) === ganking).length;
      const kills = died(false);
      const deaths = died(true);
      return {
        timestamp: f.timestamp,
        lane: f.lane,
        ganking: onSide(true),
        defending: onSide(false),
        kills,
        deaths,
        outcome: kills && deaths ? "trade" : kills ? "kill" : "death",
        otherJungler: ids.has(otherJunglerId),
        laneLead: leadAt(f.timestamp, f.lane),
      };
    });

  // Visits where nobody died, from the minute snapshots. Back-to-back
  // snapshots in the same lane are one visit.
  let previousLane: Lane | null = null;
  for (const frame of replay.frames) {
    const spot = frame.positions[junglerId - 1];
    const lane = spot && inLane(spot) ? (mapArea(spot) as Lane) : null;
    const counts =
      lane !== null &&
      lane !== previousLane &&
      frame.timestamp >= GANKS_FROM_MS &&
      frame.timestamp <= GANKS_TO_MS &&
      !fights.some(
        (f) => f.lane === lane && Math.abs(f.timestamp - frame.timestamp) <= NEAR_FIGHT_MS,
      );
    if (counts) {
      ganks.push({
        timestamp: frame.timestamp,
        lane,
        ganking: 0,
        defending: 0,
        kills: 0,
        deaths: 0,
        outcome: "no kill",
        otherJungler: false,
        laneLead: leadAt(frame.timestamp, lane),
      });
    }
    previousLane = lane;
  }

  return ganks.sort((a, b) => a.timestamp - b.timestamp);
}

// Everyone who took part in one kill: the killer, the assists and the victim.
// killerId is 0 when a tower or minions finished them.
function involved(kill: ChampionKill): number[] {
  return [kill.killerId, ...kill.assistingParticipantIds, kill.victimId].filter((id) => id > 0);
}
