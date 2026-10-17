import { describe, expect, it } from "vitest";
import { analyzeMatch } from "./index";
import { recapFacts } from "./recap-facts";
import { frames, kill, match, participants, SPOTS } from "./test-fixtures";

describe("recapFacts", () => {
  // Ahri (blue mid, participant 3) loses 100 gold a minute to Syndra (8) and
  // dies to a gank at 8:10.
  const players = participants();
  players[2] = { ...players[2], kills: 2, deaths: 1, assists: 5, totalMinionsKilled: 240 };
  const game = match(players);
  const timeline = {
    frames: frames(20, (minute, id) => ({
      gold: minute * (id === 3 ? 300 : 400),
      cs: minute * 8,
    })),
    events: [kill("8:10", 7, 3, [8], SPOTS.midLane)],
  };
  const label = (name: string) => (name === "LeeSin" ? "Lee Sin" : name);
  const analysis = analyzeMatch(game, timeline, "player-3", label)!;
  const swing = {
    timestamp: 1_200_000,
    from: 0.42,
    to: 0.3,
    ours: [],
    theirs: ["Baron", "2 kills"],
  };
  const score = { participantId: 3, score: 61, badge: null, strengths: ["Vision"], weakness: "Deaths" };
  const facts = recapFacts(game, analysis, [swing], score, label);

  it("sums up the game from the player's side", () => {
    expect(facts).toMatchObject({
      result: "loss",
      champion: "Ahri",
      role: "Mid",
      laneOpponent: "Syndra",
      minutes: 30,
      kda: "2/1/5",
      csPerMin: 8,
      gameScore: { score: 61, strengths: ["Vision"], weakness: "Deaths" },
    });
  });

  it("gives the gaps to the lane opponent", () => {
    expect(facts.vsOpponentAt10).toEqual({ gold: -1000, cs: 0, xp: 0 });
    expect(facts.vsOpponentAt15?.gold).toBe(-1500);
  });

  it("writes win chance swings as percents and game clock times", () => {
    expect(facts.winChanceSwings).toEqual([
      { time: "20:00", fromPercent: 42, toPercent: 30, yourTeamTook: [], enemyTeamTook: ["Baron", "2 kills"] },
    ]);
  });

  it("counts deaths by kind", () => {
    expect(facts.deaths).toEqual({ total: 1, before14: 1, byKind: { gank: 1 } });
  });

  it("leaves out jungle facts for other roles", () => {
    expect(facts.jungle).toBeNull();
  });

  it("adds pathing and ganks for junglers", () => {
    const jungle = analyzeMatch(game, timeline, "player-2", label)!;
    const facts = recapFacts(game, jungle, null, null, label);
    expect(facts.winChanceSwings).toEqual([]);
    expect(facts.jungle).not.toBeNull();
    expect(facts.jungle?.yourGanks).toEqual(
      jungle.ganks!.yours.map((g) => expect.objectContaining({ lane: g.lane, outcome: g.outcome })),
    );
  });
});
