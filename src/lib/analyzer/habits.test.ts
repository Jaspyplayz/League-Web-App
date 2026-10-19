import { describe, expect, it } from "vitest";
import { findHabits, firstBackS, firstGankS, level6First } from "./habits";
import { clock, frames, kill, participants, SPOTS } from "./test-fixtures";
import type { TrimmedEvent } from "./trim";

// Skill points for one player, at the given game times.
function skillPoints(participantId: number, times: string[]): TrimmedEvent[] {
  return times.map((at) => ({
    type: "SKILL_LEVEL_UP",
    timestamp: clock(at),
    participantId,
    skillSlot: 1,
  }));
}

function buy(at: string, participantId: number, itemId = 1055): TrimmedEvent {
  return { type: "ITEM_PURCHASED", timestamp: clock(at), participantId, itemId };
}

const sorted = (events: TrimmedEvent[]) => events.sort((a, b) => a.timestamp - b.timestamp);
const timeline = (events: TrimmedEvent[]) => ({ frames: frames(20), events: sorted(events) });

describe("level6First", () => {
  const five = ["0:00", "1:30", "2:30", "3:30", "4:30"];

  it("compares when each player spent their sixth skill point", () => {
    const events = [
      ...skillPoints(2, [...five, "5:40"]),
      ...skillPoints(7, [...five, "6:10"]),
    ];
    expect(level6First(timeline(events), 2, 7)).toBe(true);
    expect(level6First(timeline(events), 7, 2)).toBe(false);
  });

  it("counts reaching 6 when the opponent never did", () => {
    const events = [...skillPoints(2, five), ...skillPoints(7, [...five, "6:10"])];
    expect(level6First(timeline(events), 2, 7)).toBe(false);
  });

  it("is null when neither player reached 6", () => {
    expect(level6First(timeline(skillPoints(2, five)), 2, 7)).toBeNull();
    expect(level6First(timeline([]), 2, 7)).toBeNull();
  });
});

describe("firstGankS", () => {
  it("finds your first kill or assist in a lane", () => {
    const events = [
      kill("3:15", 2, 9, [], SPOTS.jungle), // in the jungle, not a gank
      kill("5:20", 3, 8, [2], SPOTS.midLane),
      kill("7:00", 2, 6, [], SPOTS.topLane),
    ];
    expect(firstGankS(timeline(events), 2)).toBe(320);
  });

  it("is null with no lane takedown before 14:00", () => {
    const events = [kill("5:20", 3, 8, [], SPOTS.midLane), kill("15:00", 2, 6, [], SPOTS.topLane)];
    expect(firstGankS(timeline(events), 2)).toBeNull();
  });
});

describe("firstBackS", () => {
  it("skips the shopping at the start of the game", () => {
    const events = [buy("0:05", 2), buy("0:12", 2, 2003), buy("6:40", 2), buy("6:45", 2, 3340)];
    expect(firstBackS(timeline(events), 2)).toBe(400);
  });

  it("is null when the first trip to the shop came from dying", () => {
    const events = [buy("0:05", 2), kill("4:00", 7, 2), buy("4:05", 2), buy("8:00", 2)];
    expect(firstBackS(timeline(events), 2)).toBeNull();
  });

  it("is null without a back before 14:00", () => {
    expect(firstBackS(timeline([buy("0:05", 2), buy("15:00", 2)]), 2)).toBeNull();
  });
});

describe("findHabits", () => {
  const players = participants();
  const vi = players[1]; // blue jungle
  const lee = players[6]; // red jungle
  const ahri = players[2]; // blue mid
  const syndra = players[7]; // red mid
  vi.challenges = { initialCrabCount: 2 };
  lee.challenges = { initialCrabCount: 0 };

  it("reads the jungle habits only for junglers", () => {
    const events = [kill("4:00", 2, 8, [3], SPOTS.midLane)];
    expect(findHabits(timeline(events), vi, lee, true)).toMatchObject({
      firstScuttleLead: 2,
      firstGankS: 240,
    });
    expect(findHabits(timeline(events), ahri, syndra, false)).toMatchObject({
      firstScuttleLead: null,
      firstGankS: null,
    });
  });

  it("leaves the scuttles out when Riot didn't count them", () => {
    expect(findHabits(timeline([]), lee, players[1], true).firstScuttleLead).toBe(-2);
    expect(findHabits(timeline([]), ahri, lee, true).firstScuttleLead).toBeNull();
  });
});
