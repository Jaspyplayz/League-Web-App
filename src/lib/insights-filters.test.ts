import { describe, expect, it } from "vitest";
import type { GameTrend } from "@/lib/analyzer/trends";
import { championsPlayed, pickTier, readFilters, readView } from "./insights-filters";

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

describe("pickTier", () => {
  it("uses the rank in the URL when it has games", () => {
    expect(pickTier("diamond", ["GOLD", "DIAMOND", "CHALLENGER"])).toBe("DIAMOND");
  });

  it("falls back to the highest rank with games", () => {
    expect(pickTier(undefined, ["GOLD", "CHALLENGER"])).toBe("CHALLENGER");
    expect(pickTier("iron", ["GOLD", "DIAMOND"])).toBe("DIAMOND");
  });

  it("is null before any benchmarks are collected", () => {
    expect(pickTier("gold", [])).toBeNull();
  });
});

describe("readView", () => {
  it("reads the tab in the URL", () => {
    expect(readView("others")).toBe("others");
    expect(readView("habits")).toBe("habits");
  });

  it("falls back to Overview", () => {
    expect(readView(undefined)).toBe("overview");
    expect(readView("deep")).toBe("overview");
    expect(readView(["habits", "others"])).toBe("overview");
  });
});
