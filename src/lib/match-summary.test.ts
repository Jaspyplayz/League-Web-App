import { describe, expect, it } from "vitest";
import {
  findQueue,
  formatDuration,
  formatTier,
  gameDurationSeconds,
  summarizeMatch,
  summarizeRecord,
  timeAgo,
  topChampions,
  type MatchSummary,
} from "./match-summary";
import type { Match, Participant } from "./riot/types";

function participant(overrides: Partial<Participant>): Participant {
  return {
    puuid: "someone",
    teamId: 100,
    championName: "Ahri",
    teamPosition: "MIDDLE",
    win: true,
    kills: 0,
    deaths: 0,
    assists: 0,
    totalMinionsKilled: 0,
    neutralMinionsKilled: 0,
    item0: 0,
    item1: 0,
    item2: 0,
    item3: 0,
    item4: 0,
    item5: 0,
    item6: 0,
    summoner1Id: 4,
    summoner2Id: 14,
    ...overrides,
  };
}

// A 30-minute game where "me" went 4/2/6 with 210 CS on a team with 20 kills.
const match: Match = {
  metadata: { matchId: "NA1_1" },
  info: {
    queueId: 420,
    gameStartTimestamp: 1_700_000_000_000,
    gameEndTimestamp: 1_700_001_800_000,
    gameDuration: 1800,
    participants: [
      participant({
        puuid: "me",
        kills: 4,
        deaths: 2,
        assists: 6,
        totalMinionsKilled: 200,
        neutralMinionsKilled: 10,
        item0: 3089,
        item6: 3340,
      }),
      participant({ kills: 16 }),
      participant({ teamId: 200, win: false, kills: 30 }),
    ],
  },
};

describe("summarizeMatch", () => {
  it("pulls out the searched player's numbers", () => {
    expect(summarizeMatch(match, "me")).toEqual({
      matchId: "NA1_1",
      queue: "Ranked Solo",
      startedAt: 1_700_000_000_000,
      durationS: 1800,
      remake: false,
      win: true,
      championName: "Ahri",
      position: "Mid",
      kills: 4,
      deaths: 2,
      assists: 6,
      kda: 5,
      cs: 210,
      csPerMin: 7,
      killParticipation: 0.5, // (4 + 6) / 20 team kills; enemy kills don't count
      items: [3089, 0, 0, 0, 0, 0, 3340],
      spells: [4, 14],
    });
  });

  it("returns null when the player isn't in the match", () => {
    expect(summarizeMatch(match, "stranger")).toBeNull();
  });

  it("treats short games as remakes unless Riot says otherwise", () => {
    const short = { ...match, info: { ...match.info, gameDuration: 200 } };
    expect(summarizeMatch(short, "me")?.remake).toBe(true);

    const flagged = {
      ...match,
      info: {
        ...match.info,
        participants: [participant({ puuid: "me", gameEndedInEarlySurrender: true })],
      },
    };
    expect(summarizeMatch(flagged, "me")?.remake).toBe(true);
  });

  it("labels unknown queues and positions safely", () => {
    const odd = {
      ...match,
      info: {
        ...match.info,
        queueId: 99999,
        participants: [participant({ puuid: "me", teamPosition: "" })],
      },
    };
    const summary = summarizeMatch(odd, "me");
    expect(summary?.queue).toBe("Other");
    expect(summary?.position).toBeNull();
    expect(summary?.killParticipation).toBe(0); // no team kills: no divide by zero
  });
});

describe("gameDurationSeconds", () => {
  it("handles old games that report milliseconds", () => {
    expect(
      gameDurationSeconds({ ...match.info, gameEndTimestamp: undefined, gameDuration: 1_800_000 }),
    ).toBe(1800);
  });
});

function summary(overrides: Partial<MatchSummary>): MatchSummary {
  return { ...summarizeMatch(match, "me")!, ...overrides };
}

describe("summarizeRecord", () => {
  it("totals wins and averages, skipping remakes", () => {
    const record = summarizeRecord([
      summary({ win: true, kills: 10, deaths: 0, assists: 0, csPerMin: 8, killParticipation: 0.6 }),
      summary({ win: false, kills: 0, deaths: 5, assists: 5, csPerMin: 6, killParticipation: 0.4 }),
      summary({ remake: true, win: false, kills: 0, deaths: 9 }),
    ]);
    expect(record).toEqual({
      games: 2,
      wins: 1,
      losses: 1,
      kda: 3, // (10 + 5) / 5 deaths in total
      csPerMin: 7,
      killParticipation: 0.5,
    });
  });

  it("returns zeros for no games", () => {
    expect(summarizeRecord([])).toMatchObject({ games: 0, kda: 0, csPerMin: 0 });
  });
});

describe("topChampions", () => {
  it("orders by games played, then wins", () => {
    const top = topChampions(
      [
        summary({ championName: "Ahri", win: false }),
        summary({ championName: "Syndra", win: true }),
        summary({ championName: "Syndra", win: false }),
        summary({ championName: "Orianna", win: true }),
      ],
      2,
    );
    expect(top.map((c) => [c.championName, c.games, c.wins])).toEqual([
      ["Syndra", 2, 1],
      ["Orianna", 1, 1],
    ]);
  });
});

describe("formatting", () => {
  it("formats tiers, with no division for Master and above", () => {
    expect(formatTier({ tier: "GOLD", rank: "II" })).toBe("Gold II");
    expect(formatTier({ tier: "GRANDMASTER", rank: "I" })).toBe("Grandmaster");
  });

  it("finds a queue's entry", () => {
    const solo = {
      queueType: "RANKED_SOLO_5x5",
      tier: "GOLD",
      rank: "I",
      leaguePoints: 0,
      wins: 1,
      losses: 1,
    };
    expect(findQueue([solo], "RANKED_SOLO_5x5")).toBe(solo);
    expect(findQueue([solo], "RANKED_FLEX_SR")).toBeNull();
  });

  it("formats durations as m:ss", () => {
    expect(formatDuration(1902)).toBe("31:42");
    expect(formatDuration(65)).toBe("1:05");
  });

  it("formats how long ago", () => {
    const now = 1_700_000_000_000;
    expect(timeAgo(now - 30_000, now)).toBe("just now");
    expect(timeAgo(now - 5 * 60_000, now)).toBe("5m ago");
    expect(timeAgo(now - 3 * 3_600_000, now)).toBe("3h ago");
    expect(timeAgo(now - 2 * 86_400_000, now)).toBe("2d ago");
    expect(timeAgo(now - 65 * 86_400_000, now)).toBe("2mo ago");
  });
});
