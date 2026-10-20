import { describe, expect, it } from "vitest";
import { match, participants } from "../lib/analyzer/test-fixtures";
import { BENCHMARK_STATS_VERSION, benchmarkRow, matchRow, participantRows, winChanceRow } from "./rows";

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
      totalDamageTaken: 18_000,
      damageDealtToObjectives: 4_000,
      gameEndedInEarlySurrender: false,
      wardsPlaced: 9,
      wardsKilled: 3,
      detectorWardsPlaced: 2,
      doubleKills: 1,
      tripleKills: 0,
      quadraKills: 0,
      pentaKills: 0,
      challenges: { laneMinionsFirst10Minutes: 70, jungleCsBefore10Minutes: 4.4 },
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
      individualPosition: "MIDDLE",
      damageTaken: 18_000,
      objectiveDamage: 4_000,
      earlySurrender: false,
      wardsPlaced: 9,
      wardsKilled: 3,
      controlWards: 2,
      doubleKills: 1,
      tripleKills: 0,
      quadraKills: 0,
      pentaKills: 0,
      // 70 lane minions + 4.4 jungle monsters, rounded.
      csAt10: 74,
    });
  });

  it("leaves out the numbers Riot didn't send", () => {
    const row = participantRows(match())[0];
    expect(row.csAt10).toBeNull();
    expect(row.wardsKilled).toBeNull();
    expect(row.doubleKills).toBeNull();
  });
});

describe("benchmarkRow", () => {
  it("flattens a game summary into a row", () => {
    const row = benchmarkRow(
      {
        matchId: "KR_1",
        startedAt: 1_700_000_000_000,
        win: true,
        championName: "LeeSin",
        position: "JUNGLE",
        goldAt10: 350,
        csAt10: 4,
        goldAt15: null,
        earlyDeaths: ["caught"],
        csPerMin: { early: 6.1, mid: 6.8, late: null },
        xpAt15: 420,
        earlyTakedowns: 5,
        visionPerMin: 0.9,
        strongerSide: 0.6,
        enemyHalf: 0.25,
        gankTakedowns: 3,
        objectiveShare: 0.5,
        enemyJungleKills: 12,
        scuttles: 2,
        habits: { level6First: true, firstScuttleLead: 1, firstGankS: 245, firstBackS: 410 },
      },
      "puuid-1",
      "kr",
      "DIAMOND",
    );
    expect(row).toEqual({
      matchId: "KR_1",
      puuid: "puuid-1",
      region: "kr",
      tier: "DIAMOND",
      gameStartAt: new Date(1_700_000_000_000),
      championName: "LeeSin",
      position: "JUNGLE",
      win: true,
      goldAt10: 350,
      csAt10: 4,
      goldAt15: null,
      earlyDeaths: ["caught"],
      csPerMinEarly: 6.1,
      csPerMinMid: 6.8,
      csPerMinLate: null,
      xpAt15: 420,
      earlyTakedowns: 5,
      visionPerMin: 0.9,
      strongerSide: 0.6,
      enemyHalf: 0.25,
      gankTakedowns: 3,
      objectiveShare: 0.5,
      enemyJungleKills: 12,
      scuttles: 2,
      level6First: true,
      firstScuttleLead: 1,
      firstGankS: 245,
      firstBackS: 410,
      statsVersion: BENCHMARK_STATS_VERSION,
    });
  });
});

describe("winChanceRow", () => {
  it("keeps the patch and start time next to the game, for filtering and clean-up", () => {
    const game = { matchId: "NA1_1", patch: "16.20", blueWin: true, frames: [] };
    expect(winChanceRow(game, match())).toEqual({
      matchId: "NA1_1",
      patch: "16.20",
      gameStartAt: new Date(1_700_000_000_000),
      game,
    });
  });
});
