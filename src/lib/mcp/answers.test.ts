import { describe, expect, it } from "vitest";
import type { MatchSummary } from "@/lib/match-summary";
import type { LeagueEntry } from "@/lib/riot/types";
import { gameAnswer, rankAnswers, recordAnswer, riotErrorMessage } from "./answers";

function game(overrides: Partial<MatchSummary> = {}): MatchSummary {
  return {
    matchId: "NA1_1",
    queue: "Ranked Solo",
    startedAt: Date.UTC(2026, 9, 18, 20, 30),
    durationS: 1830,
    remake: false,
    win: true,
    championName: "MonkeyKing",
    position: "Jungle",
    kills: 7,
    deaths: 2,
    assists: 9,
    kda: 8,
    cs: 190,
    csPerMin: 6.2295,
    killParticipation: 0.6666,
    items: [0, 0, 0, 0, 0, 0, 0],
    spells: [4, 11],
    ...overrides,
  };
}

const url = (id: string) => `https://example.com/match/${id}`;
const label = (name: string) => (name === "MonkeyKing" ? "Wukong" : name);

describe("rankAnswers", () => {
  it("lists solo before flex, with the win rate as a whole percent", () => {
    const entries: LeagueEntry[] = [
      { queueType: "RANKED_FLEX_SR", tier: "SILVER", rank: "I", leaguePoints: 12, wins: 5, losses: 5 },
      { queueType: "RANKED_SOLO_5x5", tier: "MASTER", rank: "I", leaguePoints: 240, wins: 61, losses: 50 },
    ];
    expect(rankAnswers(entries)).toEqual([
      { queue: "Ranked Solo/Duo", rank: "Master", lp: 240, wins: 61, losses: 50, winRatePercent: 55 },
      { queue: "Ranked Flex", rank: "Silver I", lp: 12, wins: 5, losses: 5, winRatePercent: 50 },
    ]);
  });

  it("is empty for an unranked player", () => {
    expect(rankAnswers([])).toEqual([]);
  });
});

describe("gameAnswer", () => {
  it("rounds the numbers and uses the display name of the champion", () => {
    expect(gameAnswer(game(), url, label)).toEqual({
      matchId: "NA1_1",
      playedAt: "2026-10-18T20:30:00.000Z",
      queue: "Ranked Solo",
      result: "win",
      champion: "Wukong",
      role: "Jungle",
      minutes: 31,
      kda: "7/2/9",
      csPerMin: 6.2,
      killParticipationPercent: 67,
      url: "https://example.com/match/NA1_1",
    });
  });

  it("calls a remake a remake, not a loss", () => {
    expect(gameAnswer(game({ remake: true, win: false }), url, label).result).toBe("remake");
    expect(gameAnswer(game({ win: false }), url, label).result).toBe("loss");
  });
});

describe("recordAnswer", () => {
  it("adds up the games and leaves remakes out", () => {
    const games = [
      game({ win: true, kills: 10, deaths: 2, assists: 0 }),
      game({ win: false, kills: 0, deaths: 3, assists: 5 }),
      game({ remake: true, win: false }),
    ];
    expect(recordAnswer(games)).toMatchObject({
      games: 2,
      wins: 1,
      losses: 1,
      winRatePercent: 50,
      kda: 3, // (10 + 5) / (2 + 3)
    });
  });
});

describe("riotErrorMessage", () => {
  it("says how long to wait when Riot asks Turnpoint to slow down", () => {
    expect(riotErrorMessage("rate-limited", 30)).toContain("30 seconds");
  });
});
