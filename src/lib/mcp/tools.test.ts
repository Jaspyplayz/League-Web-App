import { beforeEach, describe, expect, it, vi } from "vitest";
import { match, participants } from "@/lib/analyzer/test-fixtures";
import { loadMatch } from "@/lib/match-store";
import { analyzeGameFor } from "./tools";

// analyze_game's answer for a game with no analysis. The database, Riot and
// the analyzer's facts are replaced; the check for which games are analyzed
// (src/lib/analyzer/index.ts) is the real one.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/match-store", () => ({ loadMatch: vi.fn(), loadMatches: vi.fn() }));
vi.mock("@/lib/match-facts", () => ({ loadMatchFacts: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/profile-store", () => ({ loadProfile: vi.fn(), PROFILE_MATCH_COUNT: 20 }));
vi.mock("@/lib/riot/api", () => ({ getAccount: vi.fn(), getMatchIds: vi.fn() }));
vi.mock("@/lib/ddragon", () => ({ championName: vi.fn(), getDataDragon: vi.fn() }));

// Player3#NA1 from the test fixtures, who played Ahri in "NA1_1".
const account = { puuid: "player-3", gameName: "Player3", tagLine: "NA1" };
const links = { origin: "https://turnpoint.test" };

describe("analyzeGameFor", () => {
  beforeEach(() => vi.mocked(loadMatch).mockReset());

  it("says an ARAM game has no analysis because it isn't on Summoner's Rift", async () => {
    const aram = match(participants(), 25 * 60);
    aram.info.mapId = 12;
    vi.mocked(loadMatch).mockResolvedValue(aram);
    expect(await analyzeGameFor("na", account, "NA1_1", links)).toEqual({
      message: "Only Summoner's Rift games are analyzed.",
    });
  });

  it("says a short Summoner's Rift game ended too early", async () => {
    vi.mocked(loadMatch).mockResolvedValue(match(participants(), 10 * 60));
    expect(await analyzeGameFor("na", account, "NA1_1", links)).toEqual({
      message: "This game ended before 15 minutes, which is too short to analyze.",
    });
  });
});
