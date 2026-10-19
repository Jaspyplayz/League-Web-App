import { describe, expect, it } from "vitest";
import { jungleReplay } from "./jungle-replay";
import { frames, participants, SPOTS } from "./test-fixtures";

// In the fixtures, 2 is the blue jungler (Vi) and 7 the red jungler (Lee Sin).
const players = participants();
const vi = players[1];
const leeSin = players[6];

describe("jungleReplay", () => {
  it("is only for junglers with an enemy jungler", () => {
    const timeline = { frames: frames(15), events: [] };
    expect(jungleReplay(timeline, players, players[0], players[5])).toBeNull();
    expect(jungleReplay(timeline, players, vi, null)).toBeNull();
    expect(jungleReplay(timeline, players, vi, leeSin)).not.toBeNull();
  });

  it("copies every player's position at every minute", () => {
    const timeline = {
      frames: frames(15, (minute, id) =>
        id === 2 && minute === 3 ? { position: SPOTS.jungle } : {},
      ),
      events: [],
    };
    const replay = jungleReplay(timeline, players, vi, leeSin)!;
    expect(replay.meId).toBe(2);
    expect(replay.enemyJunglerId).toBe(7);
    expect(replay.frames).toHaveLength(16);
    expect(replay.frames[3].positions[1]).toEqual(SPOTS.jungle);
    expect(replay.frames[4].positions[1]).toBeNull();
  });

  it("adds up gold and XP per lane, with the support in bot lane", () => {
    const stats: Record<number, { gold: number; xp: number }> = {
      1: { gold: 3000, xp: 2000 }, // blue top
      6: { gold: 2500, xp: 1800 }, // red top
      3: { gold: 3000, xp: 2000 }, // blue mid
      8: { gold: 3000, xp: 2000 }, // red mid
      4: { gold: 3000, xp: 1500 }, // blue bot
      5: { gold: 1500, xp: 1200 }, // blue support
      9: { gold: 3500, xp: 1700 }, // red bot
      10: { gold: 1800, xp: 1300 }, // red support
    };
    const timeline = { frames: frames(15, (_, id) => stats[id] ?? {}), events: [] };
    const replay = jungleReplay(timeline, players, vi, leeSin)!;
    expect(replay.frames[10].laneLeads).toEqual({ top: 700, mid: 0, bot: -1100 });

    // From the red jungler's point of view, every lead flips.
    const red = jungleReplay(timeline, players, leeSin, vi)!;
    expect(red.frames[10].laneLeads).toEqual({ top: -700, mid: 0, bot: 1100 });
  });

  it("skips lanes it can't match up", () => {
    const odd = participants();
    odd[0] = { ...odd[0], teamPosition: "", individualPosition: "Invalid" }; // blue top unknown
    const replay = jungleReplay({ frames: frames(15), events: [] }, odd, odd[1], odd[6])!;
    expect(replay.frames[5].laneLeads.top).toBeNull();
    expect(replay.frames[5].laneLeads.mid).toBe(0);
  });
});
