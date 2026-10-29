import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// See client.test.ts: "server-only" only works inside Next.js's server build.
vi.mock("server-only", () => ({}));

const { getActiveGame, getManyMatchIds, getPlatformStatus, getTopMasteries, resetActiveGameCache } =
  await import("./api");
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

describe("getManyMatchIds", () => {
  const ids = (from: number, n: number) => Array.from({ length: n }, (_, i) => `NA1_${from + i}`);

  it("asks once for 100 IDs or fewer", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(ids(0, 30))));
    await expect(getManyMatchIds("na", "abc", 30)).resolves.toHaveLength(30);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("start=0&count=30");
  });

  it("asks for the next 100 past the first, keeping the game-mode filter", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify(ids(0, 100))))
      .mockResolvedValueOnce(new Response(JSON.stringify(ids(100, 50))));
    const result = await getManyMatchIds("na", "abc", 150, { queue: 420 });
    expect(result).toEqual(ids(0, 150));
    expect(String(fetchMock.mock.calls[0][0])).toContain("start=0&count=100&queue=420");
    expect(String(fetchMock.mock.calls[1][0])).toContain("start=100&count=50&queue=420");
  });

  it("drops an ID repeated when a game ends between two calls, and asks for one more", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify(ids(0, 100))))
      .mockResolvedValueOnce(new Response(JSON.stringify(ids(99, 50))))
      .mockResolvedValueOnce(new Response(JSON.stringify(ids(149, 1))));
    await expect(getManyMatchIds("na", "abc", 150)).resolves.toEqual(ids(0, 150));
    expect(String(fetchMock.mock.calls[2][0])).toContain("start=150&count=1");
  });

  it("stops when Riot runs out of games", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(ids(0, 40))));
    await expect(getManyMatchIds("na", "abc", 200)).resolves.toHaveLength(40);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
