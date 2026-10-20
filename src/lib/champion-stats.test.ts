import { describe, expect, it } from "vitest";
import { championStats, type StatsGame, type StatsPlayer } from "./champion-stats";
import { SCORE_MODEL } from "./game-score";

const ROLES = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];
const ME = "player-2"; // blue side's jungler

// A 30 minute ranked game: blue side (players 1 to 5) against red (6 to 10),
// one player per role on each side. `me` and `enemy` change the two junglers.
function game(
  matchId: string,
  me: Partial<StatsPlayer> = {},
  enemy: Partial<StatsPlayer> = {},
  extra: Partial<StatsGame> = {},
): StatsGame {
  const players = Array.from(
    { length: 10 },
    (_, i): StatsPlayer => ({
      participantId: i + 1,
      puuid: `player-${i + 1}`,
      teamId: i < 5 ? 100 : 200,
      championName: `Champ${i + 1}`,
      teamPosition: ROLES[i % 5],
      individualPosition: ROLES[i % 5],
      win: i < 5,
      kills: 2,
      deaths: 2,
      assists: 2,
      cs: 150,
      goldEarned: 10_000,
      damageToChampions: 10_000,
      damageTaken: 15_000,
      objectiveDamage: 3_000,
      visionScore: 20,
      earlySurrender: false,
      wardsPlaced: 10,
      wardsKilled: 2,
      controlWards: 1,
      doubleKills: 0,
      tripleKills: 0,
      quadraKills: 0,
      pentaKills: 0,
      csAt10: 60,
    }),
  );
  players[1] = { ...players[1], championName: "Vi", ...me };
  players[6] = { ...players[6], championName: "LeeSin", ...enemy };
  return { matchId, queueId: 420, durationS: 1800, players, ...extra };
}

describe("championStats", () => {
  it("adds up each champion's games, most played first", () => {
    const { all, champions } = championStats(
      [
        game("1", { kills: 6, deaths: 1, assists: 8, damageToChampions: 20_000 }),
        game("2", { win: false, kills: 2, deaths: 5, assists: 4, cs: 210 }),
        game("3", { championName: "Nidalee" }),
      ],
      ME,
      null,
      SCORE_MODEL,
    );

    expect(champions.map((c) => c.championName)).toEqual(["Vi", "Nidalee"]);
    expect(all.games).toBe(3);
    const vi = champions[0];
    expect(vi).toMatchObject({ games: 2, wins: 1, kills: 4, deaths: 3, assists: 6 });
    // (6 + 2 + 8 + 4) / (1 + 5), from the totals, not each game's KDA.
    expect(vi.kda).toBeCloseTo(20 / 6);
    // Game 1: 14 of the team's 6 + 8 = 14 kills; game 2: 6 of 10.
    expect(vi.killParticipation).toBeCloseTo((14 / 14 + 6 / 10) / 2);
    // 20,000 of 60,000 team damage, then 10,000 of 50,000.
    expect(vi.damageShare).toBeCloseTo((1 / 3 + 1 / 5) / 2);
    expect(vi.damagePerMin).toBeCloseTo(30_000 / 60);
    expect(vi.cs).toBe(180);
    expect(vi.csPerMin).toBeCloseTo(360 / 60);
  });

  it("splits a champion's games by the enemy in the same role", () => {
    const { champions } = championStats(
      [
        game("1", { csAt10: 70 }, { csAt10: 60 }),
        game("2", { csAt10: 50 }, { csAt10: 60 }),
        game("3", { csAt10: 66 }, { championName: "Graves", csAt10: 60 }),
      ],
      ME,
      null,
      SCORE_MODEL,
    );
    const vi = champions[0];
    expect(vi.opponents.map((o) => [o.championName, o.games])).toEqual([
      ["LeeSin", 2],
      ["Graves", 1],
    ]);
    // Leads of +10, -10 and +6.
    expect(vi.csLeadAt10).toBeCloseTo(2);
    expect(vi.aheadAt10).toBeCloseTo(2 / 3);
    expect(vi.opponents[0].csLeadAt10).toBe(0);
    expect(vi.opponents[0].aheadAt10).toBe(0.5);
  });

  it("finds the lane opponent from Riot's guess when the role is blank", () => {
    const { champions } = championStats(
      [game("1", { teamPosition: "" }, { teamPosition: "", championName: "Kayn" })],
      ME,
      null,
      SCORE_MODEL,
    );
    expect(champions[0].opponents.map((o) => o.championName)).toEqual(["Kayn"]);
  });

  it("only counts the chosen game modes and leaves remakes out", () => {
    const games = [
      game("1"),
      game("2", { championName: "Jinx" }, {}, { queueId: 450 }),
      game("3", { championName: "Ezreal" }, {}, { durationS: 200 }),
      game("4", { championName: "Ezreal", earlySurrender: true }),
    ];
    expect(
      championStats(games, ME, [420], SCORE_MODEL).champions.map((c) => c.championName),
    ).toEqual(["Vi"]);
    expect(championStats(games, ME, null, SCORE_MODEL).all.games).toBe(2);
  });

  it("averages the game score, skipping games saved without its numbers", () => {
    const scored = championStats([game("1")], ME, null, SCORE_MODEL).champions[0];
    expect(scored.score).toBeGreaterThanOrEqual(0);
    expect(scored.score).toBeLessThanOrEqual(100);

    const older = championStats([game("1", { damageTaken: null })], ME, null, SCORE_MODEL);
    expect(older.champions[0].score).toBeNull();
  });

  it("totals multikills and averages wards over the games that have them", () => {
    const { champions } = championStats(
      [
        game("1", { doubleKills: 2, pentaKills: 1, wardsPlaced: 12 }),
        game("2", { doubleKills: 1, wardsPlaced: null }),
      ],
      ME,
      null,
      SCORE_MODEL,
    );
    expect(champions[0]).toMatchObject({ doubleKills: 3, pentaKills: 1, wardsPlaced: 12 });
  });

  it("has nothing to show for a player with no games", () => {
    const { all, champions } = championStats([], ME, null, SCORE_MODEL);
    expect(champions).toEqual([]);
    expect(all).toMatchObject({ games: 0, score: null, csLeadAt10: null });
  });
});
