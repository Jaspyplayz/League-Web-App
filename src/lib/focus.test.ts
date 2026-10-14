import { describe, expect, it } from "vitest";
import type { WeaknessId } from "./analyzer/trends";
import { parseFocuses, playerKey, saveFocus, summarizeFocus, type FocusGame } from "./focus";

const ME = playerKey("na", "Jaspy", "CA1");

// A made-up game that started at minute `at`, where the "behind at 10"
// weakness showed up (true), was avoided (false) or can't be judged (null).
function game(at: number, behind: boolean | null): FocusGame {
  return {
    matchId: `NA1_${at}`,
    startedAt: at,
    shows: { "behind-at-10": behind } as Record<WeaknessId, boolean | null>,
  };
}

describe("saved focuses", () => {
  it("round-trips a player's focus", () => {
    const saved = saveFocus(null, ME, { id: "early-gank", setAt: 5 });
    expect(parseFocuses(saved)).toEqual({ [ME]: { id: "early-gank", setAt: 5 } });
  });

  it("keeps each player's focus separate, and clears one", () => {
    let saved = saveFocus(null, ME, { id: "cs-drop", setAt: 1 });
    saved = saveFocus(saved, "kr/faker#kr1", { id: "leads-slip", setAt: 2 });
    saved = saveFocus(saved, ME, null);
    expect(parseFocuses(saved)).toEqual({ "kr/faker#kr1": { id: "leads-slip", setAt: 2 } });
  });

  it("ignores anything it doesn't recognize", () => {
    expect(parseFocuses(null)).toEqual({});
    expect(parseFocuses("not json")).toEqual({});
    expect(parseFocuses("[]")).toEqual({});
    const saved = JSON.stringify({ a: { id: "made-up", setAt: 1 }, b: { id: "cs-drop" } });
    expect(parseFocuses(saved)).toEqual({});
  });

  it("treats Riot IDs the same whatever their case", () => {
    expect(playerKey("NA", "jaspy", "ca1")).toBe(ME);
  });
});

describe("summarizeFocus", () => {
  const focus = { id: "behind-at-10" as const, setAt: 10 };

  it("splits games into before and since the focus was set", () => {
    const games = [game(1, true), game(2, false), game(11, false), game(12, true)];
    const summary = summarizeFocus(games, focus);
    expect(summary.since.map((r) => r.avoided)).toEqual([true, false]);
    expect(summary).toMatchObject({ counted: 2, avoided: 1, before: { counted: 2, avoided: 1 } });
  });

  it("counts the latest games in a row where you avoided it", () => {
    const games = [game(11, true), game(12, false), game(13, false)];
    expect(summarizeFocus(games, focus).streak).toBe(2);
    expect(summarizeFocus([...games, game(14, true)], focus).streak).toBe(0);
  });

  it("doesn't let games that can't say count or break a streak", () => {
    const games = [game(11, false), game(12, null), game(13, false)];
    const summary = summarizeFocus(games, focus);
    expect(summary).toMatchObject({ counted: 2, avoided: 2, streak: 2 });
    expect(summary.since).toHaveLength(3);
  });

  it("puts games oldest first whatever order they come in", () => {
    const summary = summarizeFocus([game(13, true), game(11, false)], focus);
    expect(summary.since.map((r) => r.matchId)).toEqual(["NA1_11", "NA1_13"]);
  });
});
