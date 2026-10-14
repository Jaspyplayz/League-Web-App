// Small made-up games for the analyzer's tests. Real Riot payloads are huge;
// these contain just the fields the analyzer reads.

import type { Match, Participant } from "@/lib/riot/types";
import type { PlayerFrame, TrimmedEvent, TrimmedFrame } from "./trim";

const ROLES = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];
const BLUE = ["Gnar", "Vi", "Ahri", "Jinx", "Thresh"];
const RED = ["Darius", "LeeSin", "Syndra", "Kaisa", "Nautilus"];

// participantId 1-5 are blue side (team 100), 6-10 red side (team 200), in
// the order top, jungle, mid, bot, support. So 3 is blue mid and 8 is red mid.
export function participants(): Participant[] {
  return [...BLUE, ...RED].map((championName, i) => {
    const role = ROLES[i % 5];
    return {
      puuid: `player-${i + 1}`,
      participantId: i + 1,
      riotIdGameName: `Player${i + 1}`,
      riotIdTagline: "NA1",
      teamId: i < 5 ? 100 : 200,
      championId: i + 1,
      championName,
      teamPosition: role,
      individualPosition: role,
      win: i >= 5,
      kills: 0,
      deaths: 0,
      assists: 0,
      totalMinionsKilled: 0,
      neutralMinionsKilled: 0,
      goldEarned: 0,
      totalDamageDealtToChampions: 0,
      totalDamageTaken: 0,
      wardsPlaced: 0,
      visionScore: 0,
      item0: 0,
      item1: 0,
      item2: 0,
      item3: 0,
      item4: 0,
      item5: 0,
      item6: 0,
      summoner1Id: 4,
      summoner2Id: 14,
      champLevel: 18,
    };
  });
}

export function match(players: Participant[] = participants(), durationS = 1800): Match {
  return {
    metadata: { matchId: "NA1_1" },
    info: {
      platformId: "NA1",
      gameVersion: "16.20.712.3456",
      queueId: 420,
      gameStartTimestamp: 1_700_000_000_000,
      gameEndTimestamp: 1_700_000_000_000 + durationS * 1000,
      gameDuration: durationS,
      participants: players,
    },
  };
}

// One frame per minute from 0 to `minutes`. `stats` gives each player's
// numbers at each minute; anything it leaves out is zero.
export function frames(
  minutes: number,
  stats: (minute: number, participantId: number) => Partial<PlayerFrame> = () => ({}),
): TrimmedFrame[] {
  const out: TrimmedFrame[] = [];
  for (let minute = 0; minute <= minutes; minute++) {
    const players: PlayerFrame[] = [];
    for (let id = 1; id <= 10; id++) {
      players.push({
        gold: 0,
        xp: 0,
        level: 1,
        cs: 0,
        damage: 0,
        position: null,
        ...stats(minute, id),
      });
    }
    out.push({ timestamp: minute * 60_000, players });
  }
  return out;
}

// A champion kill at a game time given as "m:ss".
export function kill(
  at: string,
  killerId: number,
  victimId: number,
  assists: number[] = [],
  position: { x: number; y: number } | null = null,
): TrimmedEvent {
  return {
    type: "CHAMPION_KILL",
    timestamp: clock(at),
    killerId,
    victimId,
    assistingParticipantIds: assists,
    position,
  };
}

export function clock(at: string): number {
  const [m, s] = at.split(":").map(Number);
  return (m * 60 + s) * 1000;
}

// Map spots for tests, one per area.
export const SPOTS = {
  topLane: { x: 1500, y: 9000 },
  midLane: { x: 7400, y: 7300 },
  botLane: { x: 10000, y: 1200 },
  jungle: { x: 4000, y: 8000 },
};
