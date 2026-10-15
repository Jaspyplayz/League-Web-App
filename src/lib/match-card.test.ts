import { describe, expect, it } from "vitest";
import { match, participants } from "@/lib/analyzer/test-fixtures";
import { matchCard } from "@/lib/match-card";
import type { MatchWinChance } from "@/lib/win-chance";

function game() {
  const players = participants();
  const me = { ...players[7], kills: 9, deaths: 2, assists: 10 }; // red mid, won
  players[7] = me;
  return { m: match(players, 1467), me };
}

describe("matchCard", () => {
  it("sums up the player's game", () => {
    const { m, me } = game();
    const card = matchCard(m, me, "Player8#NA1", "Syndra", null);
    expect(card).toMatchObject({
      riotId: "Player8#NA1",
      champion: "Syndra",
      details: "Mid · 24:27",
      result: "Victory",
      kda: "9 / 2 / 10",
      swing: null,
      chances: [],
    });
  });

  it("picks the swing that moved the win chance most", () => {
    const { m, me } = game();
    const winChance = {
      chances: [
        { minute: 0, chance: 0.5 },
        { minute: 1, chance: 0.625 },
      ],
      swings: [
        {
          timestamp: 600_000,
          from: 0.5,
          to: 0.6,
          ours: ["Dragon"],
          theirs: [],
        },
        {
          timestamp: 1_200_000,
          from: 0.6,
          to: 0.4,
          ours: [],
          theirs: ["Baron", "2 kills"],
        },
      ],
      model: {} as MatchWinChance["model"],
    } satisfies MatchWinChance;
    const card = matchCard(m, me, "Player8#NA1", "Syndra", winChance);
    expect(card.swing).toEqual({
      clock: "20:00",
      from: 60,
      to: 40,
      title: "The enemy team took Baron and 2 kills",
    });
    expect(card.chances).toEqual([50, 63]);
  });

  it("has no swing when the win chance never moved much", () => {
    const { m, me } = game();
    const winChance = {
      chances: [{ minute: 0, chance: 0.5 }],
      swings: [],
      model: {} as MatchWinChance["model"],
    } satisfies MatchWinChance;
    expect(matchCard(m, me, "Player8#NA1", "Syndra", winChance).swing).toBeNull();
  });

  it("calls a game under five minutes a remake", () => {
    const { me } = game();
    expect(matchCard(match(participants(), 200), me, "Player8#NA1", "Syndra", null).result).toBe(
      "Remake",
    );
  });
});
