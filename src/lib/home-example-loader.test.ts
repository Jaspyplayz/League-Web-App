import { beforeEach, describe, expect, it, vi } from "vitest";
import comebackGame from "@/lib/analyzer/fixtures/comeback.json";
import type { TrimmedTimeline } from "@/lib/analyzer/trim";
import { buildDataDragon, getDataDragon } from "@/lib/ddragon";
import { readSavedGame } from "@/lib/match-store";
import type { Match } from "@/lib/riot/types";
import { loadHomeExample } from "./home-example-loader";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: vi.fn() }));
vi.mock("@/lib/match-store", () => ({ readSavedGame: vi.fn() }));
// Only the download is faked; championName is the real one.
vi.mock("@/lib/ddragon", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ddragon")>()),
  getDataDragon: vi.fn(),
}));
// The sample game here is the comeback golden game, seen from Player 3's
// Vladimir, whose lane opponent is Twisted Fate. Riot's match data calls him
// "TwistedFate", so the raw ID and the name players know differ.
vi.mock("@/lib/sample-match", () => ({
  SAMPLE_MATCH: { region: "na1", gameName: "Player 3", tagLine: "GOLD", matchId: "NA1_comeback" },
}));

const comeback = comebackGame as unknown as { match: Match; timeline: TrimmedTimeline };
const dd = buildDataDragon(
  "16.20.1",
  {
    data: {
      Vladimir: { id: "Vladimir", name: "Vladimir" },
      TwistedFate: { id: "TwistedFate", name: "Twisted Fate" },
    },
  },
  { data: {} },
  { data: {} },
  [],
);

describe("loadHomeExample", () => {
  beforeEach(() => {
    vi.mocked(readSavedGame).mockResolvedValue(comeback);
    vi.mocked(getDataDragon).mockResolvedValue(dd);
  });

  it("reads the sample game and names champions the way players know them", async () => {
    const example = await loadHomeExample();
    expect(readSavedGame).toHaveBeenCalledWith("NA1_comeback");
    expect(example.champion).toBe("Vladimir");
    expect(example.opponent).toBe("Twisted Fate");
  });

  // The result is kept for an hour, so a game named with raw IDs would stay
  // on home that long. Throwing means Next.js keeps nothing and the next
  // visit tries Data Dragon again.
  it("throws when Data Dragon can't be read, instead of showing raw champion IDs", async () => {
    vi.mocked(getDataDragon).mockRejectedValue(new Error("Data Dragon returned 503"));
    await expect(loadHomeExample()).rejects.toThrow("Data Dragon returned 503");
  });

  it("throws when the sample game isn't in the database", async () => {
    vi.mocked(readSavedGame).mockResolvedValue(null);
    await expect(loadHomeExample()).rejects.toThrow("couldn't be read from the database");
  });
});
