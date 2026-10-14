import { describe, expect, it } from "vitest";
import { maxOrder, playerBuilds } from "./build";
import type { TrimmedEvent } from "./trim";

const buy = (participantId: number, itemId: number, at: number): TrimmedEvent => ({
  type: "ITEM_PURCHASED",
  timestamp: at,
  participantId,
  itemId,
});

const skill = (participantId: number, skillSlot: number, at: number): TrimmedEvent => ({
  type: "SKILL_LEVEL_UP",
  timestamp: at,
  participantId,
  skillSlot,
});

describe("playerBuilds", () => {
  it("groups each player's purchases by minute", () => {
    const builds = playerBuilds([
      buy(1, 1055, 10_000),
      buy(1, 2003, 12_000),
      buy(2, 1056, 15_000),
      buy(1, 3006, 8 * 60_000 + 5_000),
    ]);
    expect(builds[1].items).toEqual([
      { minute: 0, itemIds: [1055, 2003] },
      { minute: 8, itemIds: [3006] },
    ]);
    expect(builds[2].items).toEqual([{ minute: 0, itemIds: [1056] }]);
    expect(builds[3].items).toEqual([]);
  });

  it("drops purchases that were undone", () => {
    const builds = playerBuilds([
      buy(1, 1055, 10_000),
      buy(1, 1036, 11_000),
      { type: "ITEM_UNDO", timestamp: 12_000, participantId: 1, beforeId: 1036, afterId: 0 },
    ]);
    expect(builds[1].items).toEqual([{ minute: 0, itemIds: [1055] }]);
  });

  it("keeps skill level-ups in order", () => {
    const builds = playerBuilds([skill(4, 1, 1_000), skill(4, 3, 90_000), skill(4, 1, 150_000)]);
    expect(builds[4].skills).toEqual([1, 3, 1]);
  });
});

describe("maxOrder", () => {
  it("ranks abilities by when they were maxed", () => {
    // Q to 5 first, then E to 5, W last.
    const skills = [1, 3, 2, 1, 1, 4, 1, 3, 1, 3, 4, 3, 3, 2, 2, 4, 2, 2];
    expect(maxOrder(skills)).toEqual([1, 3, 2]);
  });

  it("puts unfinished abilities after maxed ones, most points first", () => {
    expect(maxOrder([1, 2, 1, 3, 1, 4, 1, 1, 2, 2])).toEqual([1, 2, 3]);
    expect(maxOrder([])).toEqual([]);
  });
});
