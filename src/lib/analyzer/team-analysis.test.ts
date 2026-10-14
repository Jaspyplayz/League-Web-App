import { describe, expect, it } from "vitest";
import { teamAnalysis } from "./team-analysis";
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
});
