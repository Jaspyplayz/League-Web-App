// The jungle replay: for a jungler, where both junglers really were at every
// minute, what happened in that minute, and how each lane was doing. It's the
// "fog of war lifted" view of a game.
//
// It shows the situation rather than grading it. Jasper (a Grandmaster
// jungler) pointed out that most jungle decisions are situational: ganking a
// losing lane can be right when you're up numbers, and a good cross map
// depends on the whole map. So the page lays out the facts and the player
// judges.

import type { MapPosition, Participant } from "@/lib/riot/types";
import { laneOf } from "./map";
import { playedPosition, playerAt } from "./matchup";
import { findObjectives, type Objective } from "./objectives";
import type { ChampionKill, TrimmedFrame, TrimmedTimeline } from "./trim";

export type Lane = "top" | "mid" | "bot";
export const LANES: Lane[] = ["top", "mid", "bot"];

// Under this, a lane counts as even rather than ahead or behind. The lead is
// gold plus XP, so 500 is roughly one kill's worth either way.
export const EVEN_LANE_LEAD = 500;

export type LaneTone = "ahead" | "behind" | "even";

// How a lane was doing for your team. A lane that can't be matched up counts
// as even, since there's nothing to show either way.
export function laneTone(lead: number | null): LaneTone {
  if (lead === null || Math.abs(lead) < EVEN_LANE_LEAD) return "even";
  return lead > 0 ? "ahead" : "behind";
}

export type ReplayFrame = {
  // Positions are a snapshot at this time, once a minute. The last frame is
  // the end of the game, so it usually isn't on a whole minute.
  timestamp: number;
  // positions[0] is participantId 1. Null if Riot left the position out.
  positions: (MapPosition | null)[];
  // Kills and objectives since the previous frame.
  kills: ChampionKill[];
  objectives: Objective[];
  // Your team's gold + XP minus the enemy team's, per lane. Bot lane counts
  // both the bot laner and the support. Null when the lane's players can't be
  // matched up, e.g. a missing position.
  laneLeads: Record<Lane, number | null>;
};

export type JungleReplay = {
  meId: number;
  enemyJunglerId: number;
  frames: ReplayFrame[];
};

// Null unless `me` played jungle against exactly one enemy jungler.
export function jungleReplay(
  timeline: TrimmedTimeline,
  participants: Participant[],
  me: Participant,
  opponent: Participant | null,
): JungleReplay | null {
  if (playedPosition(me) !== "JUNGLE" || !opponent) return null;
  const { frames, events } = timeline;
  const kills = events.filter((e) => e.type === "CHAMPION_KILL");
  const objectives = findObjectives(events, me.teamId);
  const lanes = laneRosters(participants, me.teamId);

  return {
    meId: me.participantId,
    enemyJunglerId: opponent.participantId,
    frames: frames.map((frame, i) => {
      // Everything after the previous snapshot, up to and including this one.
      const from = i === 0 ? -Infinity : frames[i - 1].timestamp;
      const inWindow = (t: number) => t > from && t <= frame.timestamp;
      return {
        timestamp: frame.timestamp,
        positions: frame.players.map((p) => p.position),
        kills: kills.filter((k) => inWindow(k.timestamp)),
        objectives: objectives.filter((o) => inWindow(o.timestamp)),
        laneLeads: {
          top: laneLead(frame, lanes.top),
          mid: laneLead(frame, lanes.mid),
          bot: laneLead(frame, lanes.bot),
        },
      };
    }),
  };
}

type Roster = { ours: number[]; theirs: number[] };

// Which participantIds play each lane, on each team.
function laneRosters(participants: Participant[], myTeamId: number): Record<Lane, Roster> {
  const rosters: Record<Lane, Roster> = {
    top: { ours: [], theirs: [] },
    mid: { ours: [], theirs: [] },
    bot: { ours: [], theirs: [] },
  };
  for (const p of participants) {
    const lane = laneOf(playedPosition(p));
    if (!lane) continue;
    rosters[lane][p.teamId === myTeamId ? "ours" : "theirs"].push(p.participantId);
  }
  return rosters;
}

function laneLead(frame: TrimmedFrame, { ours, theirs }: Roster): number | null {
  // Uneven numbers mean positions are missing or odd, so a comparison
  // wouldn't be fair.
  if (ours.length === 0 || ours.length !== theirs.length) return null;
  const total = (ids: number[]) =>
    ids.reduce((sum, id) => sum + playerAt(frame, id).gold + playerAt(frame, id).xp, 0);
  return total(ours) - total(theirs);
}
