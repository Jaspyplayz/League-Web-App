// Pure functions that turn the app's own data into the small JSON answers
// the MCP tools send back (see src/lib/mcp/tools.ts). No network calls here,
// so they're easy to unit test.
//
// Claude reads these answers, not a person, so they're plain JSON with clear
// field names and units in the names ("winRatePercent", "minutes"), and
// leave out what only the website needs, like item icons.

import type { RiotErrorKind } from "@/lib/riot/client";
import type { LeagueEntry } from "@/lib/riot/types";
import {
  findQueue,
  formatTier,
  summarizeRecord,
  winRate,
  type MatchSummary,
} from "@/lib/match-summary";

export type RankAnswer = {
  queue: "Ranked Solo/Duo" | "Ranked Flex";
  rank: string; // "Gold II", or "Master" with no division
  lp: number;
  wins: number;
  losses: number;
  winRatePercent: number;
};

// The player's solo and flex ranks, solo first. Empty when unranked.
export function rankAnswers(entries: LeagueEntry[]): RankAnswer[] {
  const queues = [
    ["RANKED_SOLO_5x5", "Ranked Solo/Duo"],
    ["RANKED_FLEX_SR", "Ranked Flex"],
  ] as const;
  return queues.flatMap(([queueType, queue]) => {
    const entry = findQueue(entries, queueType);
    if (!entry) return [];
    return {
      queue,
      rank: formatTier(entry),
      lp: entry.leaguePoints,
      wins: entry.wins,
      losses: entry.losses,
      winRatePercent: percent(winRate(entry.wins, entry.losses)),
    };
  });
}

export type GameAnswer = {
  matchId: string;
  playedAt: string; // ISO date and time, UTC
  queue: string;
  result: "win" | "loss" | "remake";
  champion: string;
  role: string | null;
  minutes: number;
  kda: string; // "7/2/9"
  csPerMin: number;
  killParticipationPercent: number;
  // The game's page on Turnpoint, for a link in Claude's answer.
  url: string;
};

// `matchUrl` builds the game's page address; `championLabel` turns Riot's
// internal names ("MonkeyKing") into display names ("Wukong").
export function gameAnswer(
  game: MatchSummary,
  matchUrl: (matchId: string) => string,
  championLabel: (championName: string) => string,
): GameAnswer {
  return {
    matchId: game.matchId,
    playedAt: new Date(game.startedAt).toISOString(),
    queue: game.queue,
    result: game.remake ? "remake" : game.win ? "win" : "loss",
    champion: championLabel(game.championName),
    role: game.position,
    minutes: Math.round(game.durationS / 60),
    kda: `${game.kills}/${game.deaths}/${game.assists}`,
    csPerMin: round1(game.csPerMin),
    killParticipationPercent: percent(game.killParticipation),
    url: matchUrl(game.matchId),
  };
}

export type RecordAnswer = {
  games: number; // remakes left out
  wins: number;
  losses: number;
  winRatePercent: number;
  kda: number;
  csPerMin: number;
  killParticipationPercent: number;
};

// Totals across the games, the same numbers as the profile's recent summary.
export function recordAnswer(games: MatchSummary[]): RecordAnswer {
  const record = summarizeRecord(games);
  return {
    games: record.games,
    wins: record.wins,
    losses: record.losses,
    winRatePercent: percent(winRate(record.wins, record.losses)),
    kda: round1(record.kda),
    csPerMin: round1(record.csPerMin),
    killParticipationPercent: percent(record.killParticipation),
  };
}

// What to tell Claude when Riot refuses, so it can explain it to the person
// instead of guessing. Mirrors the website's notices
// (src/components/riot-error-notice.tsx).
export function riotErrorMessage(kind: RiotErrorKind, retryAfter?: number): string {
  switch (kind) {
    case "rate-limited":
      return `Turnpoint has used up its Riot API allowance for the moment. Try again in ${retryAfter ?? 10} seconds.`;
    case "bad-key":
      return "Turnpoint's Riot API key is missing or expired, so it can't reach Riot right now. This isn't a problem with the request.";
    case "not-found":
      return "Riot has no League of Legends data for that player or game in this region.";
    case "unavailable":
      return "Riot's servers didn't answer. This is usually brief; try again in a moment.";
  }
}

function percent(fraction: number): number {
  return Math.round(fraction * 100);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
