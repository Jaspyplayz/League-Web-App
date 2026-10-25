// Made-up games for the remap tests (remap-puuids-map.test.ts and
// remap-puuids-db.test.ts). Each game is described once by its players'
// names and built under either key, the way Riot would send it to the old
// app and to the new one.

import type { Match, Participant } from "@/lib/riot/types";
import { BOT_PUUID } from "./remap-puuids-map";

export type Key = "old" | "new";

// 78 characters, like Riot's, and readable in a failing test.
export function puuid(key: Key, name: string): string {
  return `${key}-${name}-`.padEnd(78, "x");
}

export function summonerId(key: Key, name: string): string {
  return `${key}-summoner-${name}`;
}

export type GameSpec = {
  matchId: string;
  platformId: string;
  // In participant order. "BOT" is a bot.
  players: string[];
  startedAt: string;
  queueId?: number;
  // Riot leaves bots out of metadata.participants.
  humansOnlyInMetadata?: boolean;
};

// What differs in Riot's copy, for the games that shouldn't pair up.
export type Changes = {
  // Participant number -> champion ID.
  champions?: Record<number, number>;
  // Player name -> the PUUID Riot sends instead.
  puuids?: Record<string, string>;
};

export function game(spec: GameSpec, key: Key, changes: Changes = {}): Match {
  const half = spec.players.length / 2;
  const idOf = (name: string) =>
    name === BOT_PUUID ? BOT_PUUID : (changes.puuids?.[name] ?? puuid(key, name));
  const participants = spec.players.map((name, i): Participant & Record<string, unknown> => ({
    puuid: idOf(name),
    summonerId: name === BOT_PUUID ? "" : summonerId(key, name),
    participantId: i + 1,
    riotIdGameName: name,
    riotIdTagline: "NA1",
    teamId: i < half ? 100 : 200,
    championId: changes.champions?.[i + 1] ?? 100 + i,
    championName: `Champion${100 + i}`,
    teamPosition: "MIDDLE",
    individualPosition: "MIDDLE",
    win: i < half,
    kills: i,
    deaths: 2,
    assists: 3,
    totalMinionsKilled: 150,
    neutralMinionsKilled: 12,
    goldEarned: 11000,
    totalDamageDealtToChampions: 21000,
    totalDamageTaken: 18000,
    damageDealtToObjectives: 4000,
    visionScore: 22,
    wardsPlaced: 9,
    wardsKilled: 2,
    detectorWardsPlaced: 1,
    item0: 3089,
    item1: 0,
    item2: 0,
    item3: 0,
    item4: 0,
    item5: 0,
    item6: 3340,
    summoner1Id: 4,
    summoner2Id: 14,
    champLevel: 16,
    doubleKills: 1,
    tripleKills: 0,
    quadraKills: 0,
    pentaKills: 0,
    // Fractions, so a rewrite that rounds numbers would show.
    damagePerMinute: 666.6666666666666,
    challenges: { laneMinionsFirst10Minutes: 71, jungleCsBefore10Minutes: 0.5 },
    perks: {
      statPerks: { offense: 5008, flex: 5008, defense: 5011 },
      styles: [{ description: "primaryStyle", style: 8100, selections: [{ perk: 8112 }] }],
    },
  }));
  const listed = spec.humansOnlyInMetadata
    ? spec.players.filter((name) => name !== BOT_PUUID)
    : spec.players;
  const start = Date.parse(spec.startedAt);
  return {
    metadata: { dataVersion: "2", matchId: spec.matchId, participants: listed.map(idOf) },
    info: {
      platformId: spec.platformId,
      gameVersion: "16.20.712.3456",
      queueId: spec.queueId ?? 420,
      mapId: spec.queueId === 1700 ? 30 : 11,
      gameCreation: start - 60_000,
      gameStartTimestamp: start,
      gameEndTimestamp: start + 1_800_000,
      gameDuration: 1800,
      participants,
      teams: [
        { teamId: 100, win: true },
        { teamId: 200, win: false },
      ],
    },
  } as Match;
}

export function names(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}${i + 1}`);
}
