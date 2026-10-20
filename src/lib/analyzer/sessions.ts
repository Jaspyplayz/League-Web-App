// Session blocks on the Insights page: does a player do better in short
// blocks of games, and do long blocks go with a lower win rate or game
// score? See docs/sessions.md.
//
// A session (a "block") is games played back to back: less than
// SESSION_GAP_MS between one game ending and the next one starting. The
// report splits games two ways, by how long their block was and by where in
// the block they came (1st game, 2nd game...), and gives the win rate and
// the average game score of each group.
//
// Like the Habits section, it describes a pattern and never grades it:
// later games can go worse for reasons that have nothing to do with being
// tired (a tilting loss streak is also what keeps people queuing).

import type { Match } from "@/lib/riot/types";
import { findPlayer } from "./index";

// Games closer together than this belong to the same block. Thirty minutes
// covers a champion select, a short break or a dodge, but not dinner.
export const SESSION_GAP_MS = 30 * 60 * 1000;

// Groups with fewer games than this get a "could be luck" note: a few wins
// either way would move their numbers a lot.
export const FEW_GAMES = 10;

// The block number the main comparison splits at: games 1 to 3 against the
// 4th game onward, since "about 3 games" is the question being asked.
export const LATER_FROM = 4;

// One game, reduced to what the sessions need.
export type SessionGame = {
  startedAt: number;
  endedAt: number;
  win: boolean;
  // The player's game score from 0 to 100. Null when the game can't be
  // scored (ARAM, Arena, remakes): it still keeps a block going, since it
  // was played in that sitting, but it isn't counted in the numbers.
  score: number | null;
};

// `scoreOf` is the player's game score in a match (src/lib/game-score.ts),
// passed in so the analyzer stays free of the trained model. Matches the
// player isn't in are left out.
export function toSessionGames(
  matches: Match[],
  puuid: string,
  scoreOf: (match: Match, participantId: number) => number | null,
): SessionGame[] {
  return matches.flatMap((match) => {
    const me = findPlayer(match, puuid);
    if (!me) return [];
    const { gameStartTimestamp, gameEndTimestamp } = match.info;
    return [
      {
        startedAt: gameStartTimestamp,
        // Games from before late 2021 have no end time, and gameDuration was
        // in milliseconds then (see gameDurationSeconds).
        endedAt:
          gameEndTimestamp ?? gameStartTimestamp + match.info.gameDuration,
        win: me.win,
        score: scoreOf(match, me.participantId),
      },
    ];
  });
}

// Splits games into blocks, oldest first, each block in the order played.
export function splitSessions(games: SessionGame[]): SessionGame[][] {
  const sorted = [...games].sort((a, b) => a.startedAt - b.startedAt);
  const sessions: SessionGame[][] = [];
  for (const game of sorted) {
    const current = sessions.at(-1);
    const previous = current?.at(-1);
    if (
      current &&
      previous &&
      game.startedAt - previous.endedAt < SESSION_GAP_MS
    ) {
      current.push(game);
    } else {
      sessions.push([game]);
    }
  }
  return sessions;
}

// The numbers for one group of games. Only scored games are counted, so the
// win rate and the average score are about the same games.
export type GroupStats = {
  label: string;
  games: number;
  wins: number;
  // 0 to 100, rounded. Null when the group has no games.
  winRate: number | null;
  averageScore: number | null;
  few: boolean;
};

export type LengthGroup = GroupStats & { sessions: number };

export type SessionReport = {
  // Scored games and the blocks they were in.
  games: number;
  sessions: number;
  // Blocks of 1 to 2, 3, 4 to 5 and 6 or more games, by their total length
  // (unscored games included, since they were still played).
  byLength: LengthGroup[];
  // 1st game of a block, 2nd, ... 6th and later. Groups past the longest
  // block are left out.
  byNumber: GroupStats[];
  // Games 1 to 3 against the 4th game onward. Null when no block reached a
  // 4th game.
  later: { before: GroupStats; after: GroupStats } | null;
};

const LENGTHS = [
  { label: "1–2 games", min: 1, max: 2 },
  { label: "3 games", min: 3, max: 3 },
  { label: "4–5 games", min: 4, max: 5 },
  { label: "6+ games", min: 6, max: Infinity },
];

const NUMBERS = [
  "1st game",
  "2nd game",
  "3rd game",
  "4th game",
  "5th game",
  "6th game on",
];

// Null when no game could be scored.
export function analyzeSessions(games: SessionGame[]): SessionReport | null {
  const sessions = splitSessions(games);
  // Each game with its place in its block (1 for the first) and the
  // block's length.
  const placed = sessions.flatMap((s) =>
    s.map((game, i) => ({ game, n: i + 1, length: s.length })),
  );
  const scored = placed.filter((p) => p.game.score !== null);
  if (scored.length === 0) return null;

  const byLength = LENGTHS.map(({ label, min, max }) => {
    const inGroup = scored.filter((p) => p.length >= min && p.length <= max);
    return {
      ...stats(
        label,
        inGroup.map((p) => p.game),
      ),
      sessions: sessions.filter(
        (s) => s.length >= min && s.length <= max && s.some(isScored),
      ).length,
    };
  });

  const longest = Math.max(...sessions.map((s) => s.length));
  const byNumber = NUMBERS.slice(0, Math.min(longest, NUMBERS.length)).map(
    (label, i) => {
      const last = i === NUMBERS.length - 1;
      const inGroup = scored.filter((p) =>
        last ? p.n >= i + 1 : p.n === i + 1,
      );
      return stats(
        label,
        inGroup.map((p) => p.game),
      );
    },
  );

  const after = scored.filter((p) => p.n >= LATER_FROM).map((p) => p.game);
  const before = scored.filter((p) => p.n < LATER_FROM).map((p) => p.game);
  return {
    games: scored.length,
    sessions: sessions.filter((s) => s.some(isScored)).length,
    byLength,
    byNumber,
    later:
      after.length > 0
        ? {
            before: stats(`Games 1–${LATER_FROM - 1}`, before),
            after: stats(`Game ${LATER_FROM} on`, after),
          }
        : null,
  };
}

const isScored = (g: SessionGame) => g.score !== null;

function stats(label: string, games: SessionGame[]): GroupStats {
  const wins = games.filter((g) => g.win).length;
  const scores = games.map((g) => g.score!);
  return {
    label,
    games: games.length,
    wins,
    winRate: games.length ? Math.round((wins / games.length) * 100) : null,
    averageScore: games.length
      ? Math.round(scores.reduce((a, b) => a + b, 0) / games.length)
      : null,
    few: games.length < FEW_GAMES,
  };
}
