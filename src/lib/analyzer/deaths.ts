// Labels each of your deaths by what kind of death it was, from who was
// involved and where it happened. See docs/match-analyzer.md, "Death breakdown".

import type { Participant } from "@/lib/riot/types";
import { laneOf, mapArea } from "./map";
import { playedPosition } from "./matchup";
import type { ChampionKill, TrimmedEvent } from "./trim";

export type DeathLabel =
  | "solo" // only one lane opponent was involved (in bot lane, either enemy bot laner)
  | "lane" // bot lane only: killed by the enemy bot lane duo
  | "gank" // someone else joined, in your lane
  | "teamfight" // three or more enemies were involved
  | "caught" // one or two enemies, away from your lane (or anywhere, for junglers)
  | "executed"; // no champion got the kill: a tower, minions or a monster did

export const DEATH_LABEL_TEXT: Record<DeathLabel, string> = {
  solo: "Solo killed",
  lane: "Lost a 2v2",
  gank: "Ganked",
  teamfight: "Teamfight",
  caught: "Caught out",
  executed: "Executed",
};

// Deaths before this are "early": they cost the most, because the gold and
// XP you miss while dead matters more when everyone has less of it.
export const EARLY_DEATH_MS = 14 * 60_000;

export type Death = {
  timestamp: number;
  label: DeathLabel;
  // Enemy participantIds involved, killer first.
  enemyIds: number[];
  early: boolean;
};

export type DeathContext = {
  me: Participant;
  opponent: Participant | null;
  participants: Participant[];
};

export function findDeaths(events: TrimmedEvent[], ctx: DeathContext): Death[] {
  return events
    .filter((e): e is ChampionKill => e.type === "CHAMPION_KILL")
    .filter((e) => e.victimId === ctx.me.participantId)
    .map((kill) => {
      const enemyIds = enemiesInvolved(kill, ctx);
      return {
        timestamp: kill.timestamp,
        label: labelDeath(kill, enemyIds, ctx),
        enemyIds,
        early: kill.timestamp < EARLY_DEATH_MS,
      };
    });
}

// The killer and assisting players, keeping only enemies (and dropping the
// killerId 0 that Riot uses when a tower or minions got the kill).
export function enemiesInvolved(kill: ChampionKill, ctx: DeathContext): number[] {
  const enemyIds = new Set(
    ctx.participants.filter((p) => p.teamId !== ctx.me.teamId).map((p) => p.participantId),
  );
  const involved = [kill.killerId, ...kill.assistingParticipantIds].filter((id) =>
    enemyIds.has(id),
  );
  return [...new Set(involved)];
}

export function labelDeath(kill: ChampionKill, enemyIds: number[], ctx: DeathContext): DeathLabel {
  if (enemyIds.length === 0) return "executed";
  if (enemyIds.length >= 3) return "teamfight";

  const myLane = laneOf(playedPosition(ctx.me));
  const laneEnemies = new Set<number>();
  if (ctx.opponent) laneEnemies.add(ctx.opponent.participantId);
  // In bot lane it's two against two, so both enemy bot laners count as
  // "your lane opponents".
  if (myLane === "bot") {
    for (const p of ctx.participants) {
      if (p.teamId !== ctx.me.teamId && laneOf(playedPosition(p)) === "bot") {
        laneEnemies.add(p.participantId);
      }
    }
  }

  if (enemyIds.every((id) => laneEnemies.has(id))) {
    return enemyIds.length === 1 ? "solo" : "lane";
  }
  // Someone from outside the matchup joined. In your own lane that's a gank;
  // anywhere else you got caught.
  const area = kill.position ? mapArea(kill.position) : null;
  return myLane && area === myLane ? "gank" : "caught";
}
