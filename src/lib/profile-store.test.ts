import { beforeEach, describe, expect, it, vi } from "vitest";
import { RiotApiError } from "@/lib/riot/client";
import { getMatchIds, getRankedEntries, getSummoner } from "@/lib/riot/api";
import { loadProfile, updateProfile } from "./profile-store";

vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/riot/api", () => ({
  getSummoner: vi.fn(),
  getRankedEntries: vi.fn(),
  getMatchIds: vi.fn(),
}));

// A pretend database holding at most one saved player. readCache hands it to
// the code under test; database() returns null so nothing is written.
type SavedPlayer = {
  puuid: string;
  gameName: string;
  tagLine: string;
  region: string;
  profileIconId: number | null;
  summonerLevel: number | null;
  matchIds: string[] | null;
  matchIdsFetchedAt: Date | null;
};
let saved: SavedPlayer | undefined;
const fakeDb = {
  query: {
    players: { findFirst: async () => saved },
    rankedEntries: { findMany: async () => [] },
  },
};
vi.mock("@/lib/match-store", () => ({
  database: () => null,
  readCache: (read: (db: typeof fakeDb) => unknown) => read(fakeDb),
}));

const account = { puuid: "p1", gameName: "Jasper", tagLine: "NA1" };
const minutesAgo = (m: number) => new Date(Date.now() - m * 60 * 1000);

function savePlayer(fetchedAt: Date, region = "na") {
  saved = {
    ...account,
    region,
    profileIconId: 1,
    summonerLevel: 100,
    matchIds: ["NA1_old"],
    matchIdsFetchedAt: fetchedAt,
  };
}

beforeEach(() => {
  saved = undefined;
  vi.mocked(getSummoner).mockReset().mockResolvedValue({
    puuid: "p1",
    profileIconId: 7,
    summonerLevel: 321,
  });
  vi.mocked(getRankedEntries).mockReset().mockResolvedValue([]);
  vi.mocked(getMatchIds).mockReset().mockResolvedValue(["NA1_new"]);
});

describe("loadProfile", () => {
  it("fetches from Riot when nothing is saved", async () => {
    const profile = await loadProfile("na", account);
    expect(profile.matchIds).toEqual(["NA1_new"]);
    expect(profile.summonerLevel).toBe(321);
    expect(getMatchIds).toHaveBeenCalledOnce();
  });

  it("uses a saved profile from today without calling Riot", async () => {
    savePlayer(minutesAgo(60));
    const profile = await loadProfile("na", account);
    expect(profile.matchIds).toEqual(["NA1_old"]);
    expect(getMatchIds).not.toHaveBeenCalled();
  });

  it("fetches again once the saved profile is a day old", async () => {
    savePlayer(minutesAgo(25 * 60));
    const profile = await loadProfile("na", account);
    expect(profile.matchIds).toEqual(["NA1_new"]);
  });

  it("ignores a profile saved for another region", async () => {
    savePlayer(minutesAgo(5), "euw");
    const profile = await loadProfile("na", account);
    expect(profile.matchIds).toEqual(["NA1_new"]);
  });

  it("falls back to the old profile when Riot is down", async () => {
    savePlayer(minutesAgo(25 * 60));
    vi.mocked(getMatchIds).mockRejectedValue(new RiotApiError("unavailable", "down"));
    const profile = await loadProfile("na", account);
    expect(profile.matchIds).toEqual(["NA1_old"]);
  });

  it("throws when Riot is down and nothing is saved", async () => {
    vi.mocked(getMatchIds).mockRejectedValue(new RiotApiError("unavailable", "down"));
    await expect(loadProfile("na", account)).rejects.toThrow(RiotApiError);
  });

  it.each(["not-found", "unavailable"] as const)(
    "still loads without the icon and level when the summoner call fails with %s",
    async (kind) => {
      vi.mocked(getSummoner).mockRejectedValue(new RiotApiError(kind, "none"));
      const profile = await loadProfile("na", account);
      expect(profile.summonerLevel).toBeNull();
      expect(profile.matchIds).toEqual(["NA1_new"]);
    },
  );
});

describe("updateProfile", () => {
  it("refuses during the two minute cooldown", async () => {
    savePlayer(new Date(Date.now() - 30_000));
    const result = await updateProfile("na", "p1");
    expect(result.status).toBe("cooldown");
    expect(getMatchIds).not.toHaveBeenCalled();
  });

  it("fetches a new profile once the cooldown is over", async () => {
    savePlayer(minutesAgo(3));
    expect(await updateProfile("na", "p1")).toEqual({ status: "updated" });
    expect(getMatchIds).toHaveBeenCalledOnce();
  });

  it("never fetches a player that isn't saved", async () => {
    expect(await updateProfile("na", "someone-else")).toEqual({ status: "updated" });
    expect(getMatchIds).not.toHaveBeenCalled();
  });

  it("reports why Riot refused", async () => {
    savePlayer(minutesAgo(3));
    vi.mocked(getMatchIds).mockRejectedValue(new RiotApiError("rate-limited", "slow down", 10));
    expect(await updateProfile("na", "p1")).toEqual({ status: "failed", kind: "rate-limited" });
  });
});
