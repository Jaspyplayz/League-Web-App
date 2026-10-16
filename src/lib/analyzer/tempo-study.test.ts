import { describe, expect, it } from "vitest";
import type { Timeline, TimelineParticipantFrame } from "@/lib/riot/types";
import { match, participants } from "./test-fixtures";
import { toStudyGame } from "./tempo-study";

function rawTimeline(minutes: number): Timeline {
  const frame = (minute: number) => ({
    timestamp: minute * 60_000,
    participantFrames: Object.fromEntries(
      Array.from({ length: 10 }, (_, i) => {
        const id = i + 1;
        const p: TimelineParticipantFrame & { championStats: Record<string, number> } = {
          participantId: id,
          totalGold: 500 + minute * 400,
          currentGold: minute * 50,
          xp: minute * 300,
          level: 1 + minute,
          minionsKilled: minute,
          jungleMinionsKilled: id === 2 || id === 7 ? minute * 6 : 0,
          position: { x: 100 * id, y: 100 * id },
          championStats: { health: 600 + id, healthMax: 1000 + id },
        };
        return [String(id), p];
      }),
    ),
    events: [],
  });
  return {
    metadata: { matchId: "NA1_1" },
    info: { frameInterval: 60_000, frames: Array.from({ length: minutes + 1 }, (_, m) => frame(m)) },
  };
}

describe("toStudyGame", () => {
  it("keeps the trimmed timeline, each player's role and side, and the extra numbers", () => {
    const game = toStudyGame(match(), rawTimeline(20), "MASTER", "oce")!;
    expect(game.matchId).toBe("NA1_1");
    expect(game.tier).toBe("MASTER");
    expect(game.patch).toBe("16.20");
    expect(game.participants[1]).toEqual({
      participantId: 2,
      teamId: 100,
      position: "JUNGLE",
      championName: "Vi",
      win: false,
    });
    expect(game.timeline.frames).toHaveLength(21);
    expect(game.timeline.frames[3].players[1].unspentGold).toBe(150);
    expect(game.extra[3][1]).toEqual({ health: 602, healthMax: 1002, jungleCs: 18 });
    expect(game.extra[3][0].jungleCs).toBe(0);
  });

  it("leaves no names or PUUIDs in the saved game", () => {
    const text = JSON.stringify(toStudyGame(match(), rawTimeline(20), "MASTER", "oce"));
    expect(text).not.toContain("player-1");
    expect(text).not.toContain("Player1");
  });

  it("skips other queues, short games and games without one jungler per side", () => {
    const aram = match();
    aram.info.queueId = 450;
    expect(toStudyGame(aram, rawTimeline(20), "GOLD", "oce")).toBeNull();
    expect(toStudyGame(match(participants(), 14 * 60), rawTimeline(14), "GOLD", "oce")).toBeNull();
    const noJungler = participants().map((p) =>
      p.participantId === 7 ? { ...p, teamPosition: "MIDDLE" } : p,
    );
    expect(toStudyGame(match(noJungler), rawTimeline(20), "GOLD", "oce")).toBeNull();
  });
});
