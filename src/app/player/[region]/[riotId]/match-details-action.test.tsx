import { beforeEach, describe, expect, it, vi } from "vitest";
import { match, participants } from "@/lib/analyzer/test-fixtures";
import { loadMatch } from "@/lib/match-store";
import { loadMatchDetailsAction } from "./match-details-action";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/match-store", () => ({ loadMatch: vi.fn() }));
vi.mock("@/lib/ddragon", () => ({ getDataDragon: async () => null }));
// The panel itself is tested where it's drawn; here it only has to be asked for.
vi.mock("@/components/match-details", () => ({ MatchDetails: () => null }));

beforeEach(() => {
  vi.mocked(loadMatch)
    .mockReset()
    .mockResolvedValue({ ...match(participants()), metadata: { matchId: "NA1_1" } });
});

describe("loadMatchDetailsAction", () => {
  it("renders the panel for a match on this player's page", async () => {
    const panel = await loadMatchDetailsAction("na", "NA1_1", "player-2", "/player/na/Jaspy-CA1");
    expect(loadMatch).toHaveBeenCalledWith("na", "NA1_1");
    expect(panel).toMatchObject({
      props: { puuid: "player-2", analysisHref: "/player/na/Jaspy-CA1/match/NA1_1" },
    });
  });

  it("refuses made-up arguments without loading anything", async () => {
    const calls: [string, string, string, string][] = [
      ["moon", "NA1_1", "player-2", "/player/na/Jaspy-CA1"],
      ["na", "EUW1_1", "player-2", "/player/na/Jaspy-CA1"],
      ["na", "NA1_1", "player-2", "https://evil.example/player/na/x"],
      ["na", "NA1_1", "player-2", "/player/euw/Jaspy-CA1"],
    ];
    for (const args of calls) {
      await expect(loadMatchDetailsAction(...args)).rejects.toThrow();
    }
    expect(loadMatch).not.toHaveBeenCalled();
  });
});
