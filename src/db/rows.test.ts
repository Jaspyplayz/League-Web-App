import { describe, expect, it } from "vitest";
import { match, participants } from "../lib/analyzer/test-fixtures";
import { matchRow, participantRows } from "./rows";

describe("matchRow", () => {
  it("copies the match details and keeps the whole payload", () => {
    const m = match(participants(), 1902);
    expect(matchRow(m)).toEqual({
      matchId: "NA1_1",
      platformId: "NA1",
      queueId: 420,
      gameVersion: "16.20.712.3456",
      gameStartAt: new Date(1_700_000_000_000),
      durationS: 1902,
      raw: m,
    });
  });
});

describe("participantRows", () => {
  it("makes one scoreboard row per player", () => {
    const players = participants();
    players[2] = {
      ...players[2],
      kills: 4,
      deaths: 6,
      assists: 8,
      totalMinionsKilled: 200,
      neutralMinionsKilled: 31,
      goldEarned: 11_600,
      totalDamageDealtToChampions: 22_700,
      visionScore: 18,
      item0: 3089,
      item6: 3340,
    };
    const rows = participantRows(match(players));
    expect(rows).toHaveLength(10);
    expect(rows[2]).toEqual({
      matchId: "NA1_1",
      puuid: "player-3",
      participantId: 3,
      teamId: 100,
      championId: 3,
      championName: "Ahri",
      teamPosition: "MIDDLE",
      win: false,
      kills: 4,
      deaths: 6,
      assists: 8,
      cs: 231,
      goldEarned: 11_600,
      damageToChampions: 22_700,
      visionScore: 18,
      items: [3089, 0, 0, 0, 0, 0, 3340],
    });
  });
});
