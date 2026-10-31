import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadRankHistory, type Profile } from "@/lib/profile-store";
import { RankCards } from "./profile-header";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/profile-store", () => ({ loadRankHistory: vi.fn() }));
// The header's buttons read the database and the session; RankCards uses none of them.
vi.mock("@/components/live-badge", () => ({ LiveBadge: () => null }));
vi.mock("@/components/saved-players", () => ({ PinButton: () => null }));
vi.mock("@/components/this-is-me", () => ({ ThisIsMe: () => null }));

const profile = (stored: boolean): Profile => ({
  profileIconId: 1,
  summonerLevel: 100,
  ranked: [],
  matchIds: [],
  updatedAt: new Date(),
  stored,
});

beforeEach(() => {
  vi.mocked(loadRankHistory).mockReset().mockResolvedValue([]);
});

// The saved rank history belongs to the saved profile's region, so another
// region's page mustn't draw it next to its own ranks (JAS-41).
describe("RankCards", () => {
  it("loads the LP history for the saved profile", async () => {
    await RankCards({ puuid: "p1", profile: profile(true) });
    expect(loadRankHistory).toHaveBeenCalledWith("p1", expect.any(Date));
  });

  it("doesn't load it on another region's page", async () => {
    await RankCards({ puuid: "p1", profile: profile(false) });
    expect(loadRankHistory).not.toHaveBeenCalled();
  });
});
