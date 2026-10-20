import { beforeEach, describe, expect, it, vi } from "vitest";
import { frames, match, participants } from "@/lib/analyzer/test-fixtures";
import { readCache } from "@/lib/match-store";
import type { Match } from "@/lib/riot/types";
import { SEASON } from "@/lib/season";
import { gameRecords, loadSeasonRecords, RECORDS_VERSION } from "./record-store";

vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
// Runs the "after the page is sent" work straight away.
vi.mock("next/server", () => ({ after: (work: () => Promise<void>) => work() }));

// A pretend database. readCache answers the store's two queries in order:
// the saved rows, then the games still to work out. Writes are recorded.
let hasDatabase: boolean;
let written: unknown[];
const fakeDb = {
  insert: () => ({
    values: (row: unknown) => {
      written.push(row);
      return { onConflictDoUpdate: async () => {} };
    },
  }),
};
vi.mock("@/lib/match-store", () => ({
  database: () => (hasDatabase ? fakeDb : null),
  readCache: vi.fn(),
}));

// A saved record_games row for player-2 (Vi, jungle) with `csAt10`.
let day = 0;
function row(csAt10: number, queueId = 420) {
  day++;
  return {
    matchId: `NA1_${day}`,
    puuid: "player-2",
    championName: "Vi",
    position: "JUNGLE",
    queueId,
    gameStartAt: new Date(SEASON.start + day * 86_400_000),
    win: true,
    csAt10,
    goldAt15: null,
    level6S: null,
    earlyDeaths: null,
    earlyTakedowns: null,
    version: RECORDS_VERSION,
  };
}

// A whole game in the season where Vi has `cs` CS at 10.
function game(matchId: string, cs: number) {
  day++;
  const m = match(participants());
  const raw: Match = {
    metadata: { matchId },
    info: { ...m.info, gameStartTimestamp: SEASON.start + day * 86_400_000 },
  };
  return { raw, frames: frames(20, (minute) => ({ cs: minute * (cs / 10) })), events: [] };
}

beforeEach(() => {
  hasDatabase = true;
  written = [];
  vi.mocked(readCache).mockReset();
});

describe("gameRecords", () => {
  it("compares the game with the season's games in its queue, worked out ones included", async () => {
    const saved = [row(60), row(62), row(61), row(90, 440)];
    const missing = [game("NA1_new", 64)];
    vi.mocked(readCache).mockResolvedValueOnce(saved).mockResolvedValueOnce(missing);

    const now = game("NA1_now", 80);
    const lines = await gameRecords(now.raw, now, "player-2");

    // 4 earlier solo queue games (the flex game's 90 doesn't count) plus this one.
    expect(lines).toMatchObject([{ stat: "csAt10", value: 80, previous: 64, games: 5 }]);
    // The worked out game is saved for next time; this one waits for its timeline.
    expect(written).toMatchObject([{ matchId: "NA1_new", csAt10: 64, version: RECORDS_VERSION }]);
  });

  it("is null without a database, or when the table can't be read", async () => {
    const now = game("NA1_now", 80);
    hasDatabase = false;
    expect(await gameRecords(now.raw, now, "player-2")).toBeNull();

    hasDatabase = true;
    vi.mocked(readCache).mockResolvedValueOnce(undefined);
    expect(await gameRecords(now.raw, now, "player-2")).toBeNull();
  });

  it("skips games from an earlier season", async () => {
    const old = game("NA1_old", 80);
    old.raw.info.gameStartTimestamp = SEASON.start - 1;
    expect(await gameRecords(old.raw, old, "player-2")).toEqual([]);
    expect(readCache).not.toHaveBeenCalled();
  });
});

describe("loadSeasonRecords", () => {
  it("keeps the chosen queue's games", async () => {
    const saved = [...[60, 61, 62, 63, 64].map((cs) => row(cs)), row(90, 440)];
    vi.mocked(readCache).mockResolvedValueOnce(saved).mockResolvedValueOnce([]);
    const records = await loadSeasonRecords("player-2", [420]);
    expect(records?.games).toBe(5);
    expect(records?.roles[0].best.csAt10).toMatchObject({ value: 64, games: 5 });
  });
});
