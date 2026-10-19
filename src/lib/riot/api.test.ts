import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// See client.test.ts: "server-only" only works inside Next.js's server build.
vi.mock("server-only", () => ({}));

const { getActiveGame, getPlatformStatus, getTopMasteries, resetActiveGameCache } = await import(
  "./api"
);
const { resetCooldowns } = await import("./client");

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubEnv("RIOT_API_KEY", "RGAPI-test");
  vi.stubGlobal("fetch", fetchMock);
  resetCooldowns();
  resetActiveGameCache();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("getActiveGame", () => {
  it("asks the player's server for their current game", async () => {
    const game = { gameQueueConfigId: 420, gameStartTime: 1 };
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(game)));
    await expect(getActiveGame("euw", "abc")).resolves.toEqual(game);
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://euw1.api.riotgames.com/lol/spectator/v5/active-games/by-summoner/abc",
    );
  });

  it("returns null when the player isn't in a game", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 404 }));
    await expect(getActiveGame("na", "abc")).resolves.toBeNull();
  });

  it("reuses an answer for a minute instead of asking Riot again", async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockImplementation(async () => new Response("{}", { status: 404 }));
      await getActiveGame("na", "abc");
      await getActiveGame("na", "abc");
      expect(fetchMock).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(61_000);
      await getActiveGame("na", "abc");
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("getPlatformStatus", () => {
  it("reads the server's status page", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ incidents: [], maintenances: [] })));
    await getPlatformStatus("kr");
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://kr.api.riotgames.com/lol/status/v4/platform-data",
    );
  });
});

describe("getTopMasteries", () => {
  it("asks for the player's top four champions", async () => {
    fetchMock.mockResolvedValueOnce(new Response("[]"));
    await getTopMasteries("na", "abc");
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://na1.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/abc/top?count=4",
    );
  });
});
