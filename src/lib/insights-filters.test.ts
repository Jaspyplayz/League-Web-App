import { describe, expect, it } from "vitest";
import type { GameTrend } from "@/lib/analyzer/trends";
import { championsPlayed, readFilters } from "./insights-filters";

describe("readFilters", () => {
  it("reads the game window and champion", () => {
    expect(readFilters({ games: "50", champion: "Ahri" })).toEqual({ games: 50, champion: "Ahri" });
  });

  it("falls back to the last 20 games and every champion", () => {
    expect(readFilters({})).toEqual({ games: 20, champion: null });
    expect(readFilters({ games: "37", champion: "" })).toEqual({ games: 20, champion: null });
    expect(readFilters({ games: ["50", "100"] })).toEqual({ games: 20, champion: null });
  });
});

describe("championsPlayed", () => {
  it("lists champions by games played, then by name", () => {
    const games = ["Vi", "Ahri", "Vi", "Elise"].map((championName) => ({ championName }));
    expect(championsPlayed(games as GameTrend[])).toEqual([
      { championName: "Vi", games: 2 },
      { championName: "Ahri", games: 1 },
      { championName: "Elise", games: 1 },
    ]);
  });
});
