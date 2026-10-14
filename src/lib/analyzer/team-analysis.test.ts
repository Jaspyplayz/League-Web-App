import { describe, expect, it } from "vitest";
import { byRole, teamAnalysis, teamOrder } from "./team-analysis";
import { participants } from "./test-fixtures";

describe("teamAnalysis", () => {
  const players = participants().map((p, i) => ({
    ...p,
    kills: i + 1,
    totalDamageTaken: 1000 * (i + 1),
    wardsPlaced: i < 5 ? 10 : 5,
  }));
  const stats = teamAnalysis(players);

  it("totals each stat per team, blue side first", () => {
    const kills = stats.find((s) => s.key === "kills")!;
    expect(kills.teams.map((t) => [t.teamId, t.total])).toEqual([
      [100, 1 + 2 + 3 + 4 + 5],
      [200, 6 + 7 + 8 + 9 + 10],
    ]);
    expect(kills.max).toBe(10);
  });

  it("marks the winning team, which picks its color", () => {
    // In the fixtures red side (200) wins.
    expect(stats[0].teams.map((t) => t.won)).toEqual([false, true]);
  });

  it("keeps each player's own value", () => {
    const wards = stats.find((s) => s.key === "wards")!;
    expect(wards.teams[0].players[0]).toEqual({
      participantId: 1,
      championName: "Gnar",
      value: 10,
    });
    expect(wards.teams[1].total).toBe(25);
  });

  it("puts your team first when you are on red side", () => {
    const kills = teamAnalysis(players, 200).find((s) => s.key === "kills")!;
    expect(kills.teams.map((t) => t.teamId)).toEqual([200, 100]);
  });

  it("lists each team in role order", () => {
    // Riot's order shuffled: support, mid, top, bot, jungle.
    const shuffled = [5, 3, 1, 4, 2, 10, 8, 6, 9, 7].map((id) => players[id - 1]);
    const kills = teamAnalysis(shuffled).find((s) => s.key === "kills")!;
    expect(kills.teams[0].players.map((p) => p.championName)).toEqual([
      "Gnar",
      "Vi",
      "Ahri",
      "Jinx",
      "Thresh",
    ]);
  });
});

describe("byRole", () => {
  it("puts players without a role last, in Riot's order", () => {
    const sorted = byRole([
      { teamPosition: "", name: "a" },
      { teamPosition: "UTILITY", name: "b" },
      { teamPosition: "", name: "c" },
      { teamPosition: "TOP", name: "d" },
    ]);
    expect(sorted.map((p) => p.name)).toEqual(["d", "b", "a", "c"]);
  });
});

describe("teamOrder", () => {
  it("shows your team first, blue side when unknown", () => {
    expect(teamOrder(100)).toEqual([100, 200]);
    expect(teamOrder(200)).toEqual([200, 100]);
    expect(teamOrder()).toEqual([100, 200]);
  });
});
