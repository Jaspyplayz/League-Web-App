import { describe, expect, it } from "vitest";
import {
  findQueue,
  formatDuration,
  formatThousands,
  formatTier,
  gameDurationSeconds,
  matchBadges,
  matchTeams,
  roleCounts,
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
    participantId: 1,
    teamId: 100,
    championId: 103,
    championName: "Ahri",
    teamPosition: "MIDDLE",
    individualPosition: "MIDDLE",
    win: true,
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
    ...overrides,
  };
}

// A 30-minute game where "me" went 4/2/6 with 210 CS on a team with 20 kills.
const match: Match = {
  metadata: { matchId: "NA1_1" },
  info: {
    platformId: "NA1",
    gameVersion: "16.20.712.3456",
    queueId: 420,
    mapId: 11,
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

  it("shortens big numbers to thousands", () => {
    expect(formatThousands(12400)).toBe("12.4k");
    expect(formatThousands(1000)).toBe("1.0k");
    expect(formatThousands(999)).toBe("999");
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

describe("matchTeams", () => {
  it("splits players into blue and red side and marks the searched player", () => {
    const named = {
      ...match,
      info: {
        ...match.info,
        participants: [
          participant({ puuid: "me", riotIdGameName: "Jaspy", riotIdTagline: "CA1" }),
          participant({ championName: "LeeSin", riotIdGameName: "Ally", riotIdTagline: "NA1" }),
          participant({ teamId: 200, championName: "Syndra" }),
        ],
      },
    };
    expect(matchTeams(named, "me")).toEqual([
      [
        {
          championName: "Ahri",
          name: "Jaspy",
          riotId: { gameName: "Jaspy", tagLine: "CA1" },
          isMe: true,
        },
        {
          championName: "LeeSin",
          name: "Ally",
          riotId: { gameName: "Ally", tagLine: "NA1" },
          isMe: false,
        },
      ],
      // No Riot ID (an old game or a bot): shown, but with nothing to link to.
      [{ championName: "Syndra", name: "Unknown", riotId: null, isMe: false }],
    ]);
  });
});

describe("roleCounts", () => {
  const game = (position: string | null, remake = false) =>
    ({ position, remake }) as MatchSummary;

  it("counts games per role in map order, skipping remakes and games without a role", () => {
    const games = [game("Jungle"), game("Jungle"), game("Mid"), game("Jungle", true), game(null)];
    expect(roleCounts(games)).toEqual([
      { role: "Top", games: 0 },
      { role: "Jungle", games: 2 },
      { role: "Mid", games: 1 },
      { role: "Bot", games: 0 },
      { role: "Support", games: 0 },
    ]);
  });
});

describe("matchBadges", () => {
  const withMe = (overrides: Partial<Participant>) => ({
    ...match,
    info: { ...match.info, participants: [participant({ puuid: "me", ...overrides })] },
  });

  it("shows only the biggest multikill, plus first blood", () => {
    expect(
      matchBadges(withMe({ doubleKills: 3, tripleKills: 1, firstBloodKill: true }), "me"),
    ).toEqual(["Triple kill", "First blood"]);
    expect(matchBadges(withMe({ doubleKills: 2, pentaKills: 1, quadraKills: 1 }), "me")).toEqual([
      "Pentakill",
    ]);
  });

  it("has no badges for a quiet game or a player who isn't in it", () => {
    expect(matchBadges(withMe({ doubleKills: 0 }), "me")).toEqual([]);
    expect(matchBadges(withMe({ pentaKills: 1 }), "stranger")).toEqual([]);
  });
});
