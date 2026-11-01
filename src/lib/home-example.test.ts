import { describe, expect, it } from "vitest";
import { analyzeMatch } from "@/lib/analyzer";
import closeGame from "@/lib/analyzer/fixtures/close.json";
import comebackGame from "@/lib/analyzer/fixtures/comeback.json";
import remakeGame from "@/lib/analyzer/fixtures/remake.json";
import type { TrimmedTimeline } from "@/lib/analyzer/trim";
import type { Match } from "@/lib/riot/types";
import { summarizeExample } from "./home-example";

// The golden games (src/lib/analyzer/fixtures/README.md): in the comeback,
// Player 2 is blue's Naafiri, who won from 8,401 gold behind.
type Game = { match: Match; timeline: TrimmedTimeline };
const comeback = comebackGame as unknown as Game;
const player2 = { gameName: "Player 2", tagLine: "GOLD" };

describe("summarizeExample", () => {
  it("names the result, the champions and the details line", () => {
    const example = summarizeExample(comeback.match, comeback.timeline, player2)!;
    expect(example.won).toBe(true);
    expect(example.champion).toBe("Naafiri");
    expect(example.details).toMatch(/^Player 2#GOLD · \d+\/\d+\/\d+ · Jungle · 32:58$/);
    expect(example.description).toContain(`Gold difference against ${example.opponent} by minute.`);
  });

  it("picks the turning point that moved the gold lead most", () => {
    const example = summarizeExample(comeback.match, comeback.timeline, player2)!;
    const all = analyzeMatch(comeback.match, comeback.timeline, "golden-player-2")!.turningPoints;
    const biggest = Math.max(...all.map((t) => Math.abs(t.swing)));
    const picked = all.find((t) => t.title === example.turn?.title)!;
    expect(Math.abs(picked.swing)).toBe(biggest);
    expect(example.turn?.ahead).toBe(picked.swing > 0);
    expect(example.turn?.clock).toMatch(/^\d+:\d\d$/);
  });

  it("says when the player lost", () => {
    // In the close game, Player 7 is red's Elise, who lost.
    const close = closeGame as unknown as Game;
    const example = summarizeExample(close.match, close.timeline, { gameName: "Player 7", tagLine: "GOLD" })!;
    expect(example.won).toBe(false);
    expect(example.champion).toBe("Elise");
  });

  it("shows champions by their display names", () => {
    const example = summarizeExample(comeback.match, comeback.timeline, player2, (name) => `[${name}]`)!;
    expect(example.champion).toBe("[Naafiri]");
    expect(example.opponent).toMatch(/^\[.+\]$/);
  });

  it("gives nothing for a player who isn't in the game", () => {
    const stranger = { gameName: "Hide on bush", tagLine: "KR1" };
    expect(summarizeExample(comeback.match, comeback.timeline, stranger)).toBeNull();
  });

  it("gives nothing for a game with no timeline to chart", () => {
    const remake = (remakeGame as unknown as { match: Match }).match;
    expect(summarizeExample(remake, { frames: [], events: [] }, { gameName: "Player 1", tagLine: "GOLD" })).toBeNull();
  });
});
