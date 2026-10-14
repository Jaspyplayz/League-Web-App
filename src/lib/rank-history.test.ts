import { describe, expect, it } from "vitest";
import { graphPoints, ranksToRecord, type RankPoint } from "./rank-history";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-10-14T12:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * DAY);

const solo = {
  queueType: "RANKED_SOLO_5x5",
  tier: "DIAMOND",
  rank: "I",
  leaguePoints: 75,
  wins: 286,
  losses: 277,
};
const flex = { ...solo, queueType: "RANKED_FLEX_SR", tier: "EMERALD", leaguePoints: 20 };

describe("ranksToRecord", () => {
  it("records every queue the first time", () => {
    expect(ranksToRecord([], [solo, flex])).toEqual([solo, flex]);
  });

  it("skips a queue whose rank hasn't changed", () => {
    const latest: RankPoint[] = [{ ...solo, recordedAt: daysAgo(1) }];
    expect(ranksToRecord(latest, [solo])).toEqual([]);
  });

  it("records a queue after a game, even when LP ends up the same", () => {
    const latest: RankPoint[] = [{ ...solo, recordedAt: daysAgo(1) }];
    const afterLossAndWin = { ...solo, wins: 287, losses: 278 };
    expect(ranksToRecord(latest, [afterLossAndWin])).toEqual([afterLossAndWin]);
  });

  it("records a promotion", () => {
    const latest: RankPoint[] = [{ ...solo, recordedAt: daysAgo(1) }];
    const promoted = { ...solo, tier: "MASTER", leaguePoints: 0, wins: 287 };
    expect(ranksToRecord(latest, [promoted])).toEqual([promoted]);
  });
});

describe("graphPoints", () => {
  it("places points across the last 30 days, oldest first", () => {
    const history: RankPoint[] = [
      { ...solo, leaguePoints: 50, recordedAt: daysAgo(15) },
      { ...solo, tier: "MASTER", leaguePoints: 10, recordedAt: daysAgo(0) },
      { ...flex, recordedAt: daysAgo(3) },
    ];
    expect(graphPoints(history, "RANKED_SOLO_5x5", now)).toEqual([
      { x: 0.5, score: 2750, label: "DIAMOND I 50 LP" },
      { x: 1, score: 2810, label: "MASTER I 10 LP" },
    ]);
  });

  it("starts the line at the rank from before the window, pinned to the left edge", () => {
    const history: RankPoint[] = [
      { ...solo, leaguePoints: 0, recordedAt: daysAgo(60) },
      { ...solo, leaguePoints: 20, recordedAt: daysAgo(45) },
      { ...solo, leaguePoints: 75, recordedAt: daysAgo(6) },
    ];
    const points = graphPoints(history, "RANKED_SOLO_5x5", now);
    expect(points.map((p) => p.score)).toEqual([2720, 2775]);
    expect(points[0].x).toBe(0);
  });

  it("is empty for a queue with no history", () => {
    expect(graphPoints([], "RANKED_SOLO_5x5", now)).toEqual([]);
  });
});
