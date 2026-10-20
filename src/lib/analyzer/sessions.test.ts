import { describe, expect, it } from "vitest";
import {
  analyzeSessions,
  FEW_GAMES,
  SESSION_GAP_MS,
  splitSessions,
  toSessionGames,
  type SessionGame,
} from "./sessions";
import { match, participants } from "./test-fixtures";

const MIN = 60 * 1000;
const GAME = 30 * MIN;

// Games played back to back from `start`, 5 minutes apart: one block.
function block(
  start: number,
  results: { win: boolean; score: number | null }[],
): SessionGame[] {
  return results.map((r, i) => {
    const startedAt = start + i * (GAME + 5 * MIN);
    return { startedAt, endedAt: startedAt + GAME, ...r };
  });
}

const DAY = 24 * 60 * MIN;
const won = (score: number) => ({ win: true, score });
const lost = (score: number) => ({ win: false, score });

describe("splitSessions", () => {
  it("starts a new block when the gap after a game is 30 minutes or more", () => {
    const first = { startedAt: 0, endedAt: GAME, win: true, score: 50 };
    const close = {
      ...first,
      startedAt: GAME + SESSION_GAP_MS - 1,
      endedAt: 2 * GAME + SESSION_GAP_MS,
    };
    const far = {
      ...first,
      startedAt: close.endedAt + SESSION_GAP_MS,
      endedAt: Infinity,
    };
    // Riot lists newest first, so the input order shouldn't matter.
    expect(splitSessions([far, close, first])).toEqual([[first, close], [far]]);
  });
});

describe("analyzeSessions", () => {
  it("is null when no game could be scored", () => {
    expect(analyzeSessions(block(0, [{ win: true, score: null }]))).toBeNull();
  });

  it("groups games by block length and by their number in the block", () => {
    const games = [
      ...block(0, [won(60), lost(40)]),
      ...block(DAY, [won(70), won(60), lost(50), lost(30), lost(20)]),
    ];
    const report = analyzeSessions(games)!;
    expect(report.games).toBe(7);
    expect(report.sessions).toBe(2);

    const [short, three, medium, long] = report.byLength;
    expect(short).toMatchObject({
      sessions: 1,
      games: 2,
      wins: 1,
      winRate: 50,
      averageScore: 50,
    });
    expect(three).toMatchObject({
      sessions: 0,
      games: 0,
      winRate: null,
      averageScore: null,
    });
    expect(medium).toMatchObject({
      sessions: 1,
      games: 5,
      wins: 2,
      winRate: 40,
      averageScore: 46,
    });
    expect(long.games).toBe(0);

    // The longest block had 5 games, so there's no "6th game on" row.
    expect(report.byNumber.map((g) => g.label)).toEqual([
      "1st game",
      "2nd game",
      "3rd game",
      "4th game",
      "5th game",
    ]);
    expect(report.byNumber[0]).toMatchObject({
      games: 2,
      wins: 2,
      averageScore: 65,
    });
    expect(report.byNumber[3]).toMatchObject({
      games: 1,
      wins: 0,
      averageScore: 30,
    });

    expect(report.later!.before).toMatchObject({
      games: 5,
      wins: 3,
      averageScore: 56,
    });
    expect(report.later!.after).toMatchObject({
      games: 2,
      wins: 0,
      averageScore: 25,
    });
  });

  it("puts the 6th game and later in one group", () => {
    const report = analyzeSessions(
      block(
        0,
        Array.from({ length: 8 }, (_, i) => won(i * 10)),
      ),
    )!;
    expect(report.byNumber.at(-1)).toMatchObject({
      label: "6th game on",
      games: 3,
    });
    expect(report.byLength[3]).toMatchObject({ sessions: 1, games: 8 });
  });

  it("keeps unscored games in the block but out of the numbers", () => {
    // An ARAM in the middle still makes the last game the 3rd of the block.
    const games = block(0, [won(60), { win: true, score: null }, lost(40)]);
    const report = analyzeSessions(games)!;
    expect(report.games).toBe(2);
    expect(report.byLength[1]).toMatchObject({ sessions: 1, games: 2 });
    expect(report.byNumber[1].games).toBe(0);
    expect(report.byNumber[2]).toMatchObject({ games: 1, averageScore: 40 });
  });

  it("has no later comparison when no block reached a 4th game", () => {
    expect(
      analyzeSessions(block(0, [won(50), won(50), won(50)]))!.later,
    ).toBeNull();
  });

  it("marks groups with too few games to be sure", () => {
    const games = Array.from({ length: FEW_GAMES }, (_, i) =>
      block(i * DAY, [won(50)]),
    ).flat();
    const report = analyzeSessions(games)!;
    expect(report.byNumber[0].few).toBe(false);
    expect(analyzeSessions(games.slice(1))!.byNumber[0].few).toBe(true);
  });
});

describe("toSessionGames", () => {
  it("reads the start, end, result and score of the player's games", () => {
    const players = participants();
    const game = match(players, 1800);
    game.info.gameStartTimestamp = 1000;
    game.info.gameEndTimestamp = 1000 + 1800 * 1000;
    const me = players[0];
    const result = toSessionGames([game], me.puuid, (_, id) =>
      id === me.participantId ? 72 : null,
    );
    expect(result).toEqual([
      { startedAt: 1000, endedAt: 1801000, win: me.win, score: 72 },
    ]);
    expect(toSessionGames([game], "someone-else", () => 50)).toEqual([]);
  });
});
