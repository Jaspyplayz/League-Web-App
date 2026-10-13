// Trends across a player's recent games: the "Insights" page. Each game is
// first boiled down to a few numbers (summarizeGame), then the games are
// rolled up together (computeTrends). See docs/match-analyzer.md, "Across
// games".
//
// Like the rest of the analyzer, everything is measured against the enemy in
// the same role in the same game, so it works for every role, jungle included.

import type { Match } from "@/lib/riot/types";
import { findDeaths, type DeathLabel } from "./deaths";
import { findPlayer, isAnalyzable } from "./index";
import { findOpponent, playedPosition, playerAt, snapshotAt } from "./matchup";
import type { TrimmedFrame, TrimmedTimeline } from "./trim";

// One game, reduced to what the trends need.
export type GameTrend = {
  matchId: string;
  startedAt: number;
  win: boolean;
  championName: string;
  // Riot's position name: "TOP", "JUNGLE", "MIDDLE", "BOTTOM" or "UTILITY".
  position: string;
  // You minus your opponent. Null if the game ended before that minute.
  goldAt10: number | null;
  csAt10: number | null;
  goldAt15: number | null;
  // What kind of death each of your deaths before 14:00 was.
  earlyDeaths: DeathLabel[];
  // Your own CS per minute in each phase of the game. Null when the game
  // didn't last long enough to have that phase.
  csPerMin: { early: number; mid: number | null; late: number | null };
};

// A game counts for trends when it's long enough to analyze and the player
// had an opponent in their role. That leaves out remakes, ARAM and Arena
// (which have no roles), so their timelines are never fetched.
export function isTrendGame(match: Match, puuid: string): boolean {
  const me = findPlayer(match, puuid);
  return isAnalyzable(match) && me !== null && findOpponent(match.info.participants, me) !== null;
}

// Returns null for games that don't count (see isTrendGame).
export function summarizeGame(
  match: Match,
  timeline: TrimmedTimeline,
  puuid: string,
): GameTrend | null {
  if (!isTrendGame(match, puuid)) return null;
  const { participants } = match.info;
  const me = findPlayer(match, puuid)!;
  const opponent = findOpponent(participants, me)!;
  const { frames, events } = timeline;
  const meId = me.participantId;

  const at10 = snapshotAt(frames, meId, opponent.participantId, 10);
  const at15 = snapshotAt(frames, meId, opponent.participantId, 15);
  const deaths = findDeaths(events, { me, opponent, participants });

  return {
    matchId: match.metadata.matchId,
    startedAt: match.info.gameStartTimestamp,
    win: me.win,
    championName: me.championName,
    position: playedPosition(me),
    goldAt10: at10 ? at10.you.gold - at10.opponent.gold : null,
    csAt10: at10 ? at10.you.cs - at10.opponent.cs : null,
    goldAt15: at15 ? at15.you.gold - at15.opponent.gold : null,
    earlyDeaths: deaths.filter((d) => d.early).map((d) => d.label),
    csPerMin: csByPhase(frames, meId),
  };
}

// The late phase only counts once there are at least this many minutes of it,
// so a game that ends at 21:00 doesn't report CS/min from one minute.
const MIN_LATE_MINUTES = 5;

// CS per minute for 0 to 10, 10 to 20 and 20 minutes to the end.
export function csByPhase(frames: TrimmedFrame[], participantId: number): GameTrend["csPerMin"] {
  const csAt = (i: number) => playerAt(frames[i], participantId).cs;
  // The last frame is the end of the game; the ones before it are whole minutes.
  const last = frames.length - 1;
  const endMinute = frames[last].timestamp / 60_000;

  const early = last > 10 ? csAt(10) / 10 : csAt(last) / Math.max(endMinute, 1);
  const mid = last > 20 ? (csAt(20) - csAt(10)) / 10 : null;
  const late =
    last > 20 && endMinute - 20 >= MIN_LATE_MINUTES
      ? (csAt(last) - csAt(20)) / (endMinute - 20)
      : null;
  return { early, mid, late };
}

export type WinRecord = { games: number; wins: number };

export type Weakness = {
  title: string;
  detail: string;
  // How strongly the rule fired, from 0 to 1, used to show the worst first.
  strength: number;
};

export type Trends = {
  games: GameTrend[]; // oldest first, for the laning chart
  laning: {
    games: number; // games that reached 10 minutes
    aheadInGold: number;
    behindInGold: number;
    averageGold: number;
    // CS leaves out support games, where nobody is meant to farm.
    csGames: number;
    behindInCs: number;
    averageCs: number;
  };
  // Your record when ahead or behind in gold at 10 and at 15 minutes.
  conversion: { minute: 10 | 15; ahead: WinRecord; behind: WinRecord }[];
  earlyDeaths: {
    total: number;
    perGame: number;
    // Most common first. Only labels that happened at least once.
    byLabel: { label: DeathLabel; count: number }[];
  };
  // Averages across games that had each phase, support games left out.
  csPerMin: { early: number | null; mid: number | null; late: number | null };
  weaknesses: Weakness[];
};

// Below this many games the rules below would be guessing.
export const MIN_GAMES_FOR_WEAKNESSES = 5;
// "Most of your games": a rule fires when more than this share of games show it.
const MAJORITY = 0.5;
// Winning less than this share of games you're ahead in means leads are
// slipping away.
const LOW_CONVERSION = 0.5;
const MIN_LEADS = 4;
// Early deaths count as a pattern when there are enough of them and one kind
// makes up this big a share.
const MIN_EARLY_DEATHS = 4;
const EARLY_DEATH_SHARE = 0.4;
// CS per minute later in the game below this share of your laning CS/min.
export const CS_DROP = 0.8;
const MIN_PHASE_GAMES = 3;
// The recurring weaknesses box shows at most this many.
const MAX_WEAKNESSES = 3;

export function computeTrends(games: GameTrend[]): Trends {
  const sorted = [...games].sort((a, b) => a.startedAt - b.startedAt);
  const farming = sorted.filter((g) => g.position !== "UTILITY");

  const gold10 = values(sorted, (g) => g.goldAt10);
  const cs10 = values(farming, (g) => g.csAt10);
  const laning = {
    games: gold10.length,
    aheadInGold: gold10.filter((v) => v > 0).length,
    behindInGold: gold10.filter((v) => v < 0).length,
    averageGold: average(gold10) ?? 0,
    csGames: cs10.length,
    behindInCs: cs10.filter((v) => v < 0).length,
    averageCs: average(cs10) ?? 0,
  };

  const conversion = ([10, 15] as const).map((minute) => {
    const diff = (g: GameTrend) => (minute === 10 ? g.goldAt10 : g.goldAt15);
    return {
      minute,
      ahead: record(sorted.filter((g) => (diff(g) ?? 0) > 0)),
      behind: record(sorted.filter((g) => (diff(g) ?? 0) < 0)),
    };
  });

  const counts = new Map<DeathLabel, number>();
  for (const label of sorted.flatMap((g) => g.earlyDeaths)) {
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const byLabel = [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
  const total = byLabel.reduce((sum, l) => sum + l.count, 0);
  const earlyDeaths = { total, perGame: sorted.length ? total / sorted.length : 0, byLabel };

  const csPerMin = {
    early: average(values(farming, (g) => g.csPerMin.early)),
    mid: average(values(farming, (g) => g.csPerMin.mid)),
    late: average(values(farming, (g) => g.csPerMin.late)),
  };

  const trends = { games: sorted, laning, conversion, earlyDeaths, csPerMin, weaknesses: [] };
  return { ...trends, weaknesses: findWeaknesses(trends, farming) };
}

// The "recurring weaknesses" box: simple rules, each with a clear threshold,
// that fire when something shows up in most of your games.
export function findWeaknesses(trends: Trends, farming: GameTrend[]): Weakness[] {
  if (trends.games.length < MIN_GAMES_FOR_WEAKNESSES) return [];
  const { laning, conversion, earlyDeaths, csPerMin } = trends;
  const found: Weakness[] = [];

  if (laning.games >= MIN_GAMES_FOR_WEAKNESSES && laning.behindInGold / laning.games > MAJORITY) {
    found.push({
      title: "Behind at 10 minutes",
      detail: `You're behind your opponent in gold at 10 minutes in ${laning.behindInGold} of ${laning.games} games.`,
      strength: laning.behindInGold / laning.games,
    });
  }

  if (laning.csGames >= MIN_GAMES_FOR_WEAKNESSES && laning.behindInCs / laning.csGames > MAJORITY) {
    found.push({
      title: "Losing the CS race",
      detail: `You have less CS than your opponent at 10 minutes in ${laning.behindInCs} of ${laning.csGames} games.`,
      strength: laning.behindInCs / laning.csGames,
    });
  }

  const at15 = conversion.find((c) => c.minute === 15)!.ahead;
  if (at15.games >= MIN_LEADS && at15.wins / at15.games < LOW_CONVERSION) {
    found.push({
      title: "Leads slip away",
      detail: `You were ahead at 15 minutes in ${at15.games} games but won only ${at15.wins} of them.`,
      strength: 1 - at15.wins / at15.games,
    });
  }

  const top = earlyDeaths.byLabel[0];
  if (
    top &&
    earlyDeaths.total >= MIN_EARLY_DEATHS &&
    top.count / earlyDeaths.total >= EARLY_DEATH_SHARE
  ) {
    const share = Math.round((top.count / earlyDeaths.total) * 100);
    found.push({
      title: EARLY_DEATH_TITLES[top.label],
      detail: `${top.count} of your ${earlyDeaths.total} deaths before 14:00 came from ${EARLY_DEATH_CAUSES[top.label]} (${share}%).`,
      strength: top.count / earlyDeaths.total,
    });
  }

  // Compare the latest phase that enough games reached with laning.
  const lateGames = farming.filter((g) => g.csPerMin.late !== null).length;
  const midGames = farming.filter((g) => g.csPerMin.mid !== null).length;
  const later =
    lateGames >= MIN_PHASE_GAMES && csPerMin.late !== null
      ? { rate: csPerMin.late, when: "after 20 minutes" }
      : midGames >= MIN_PHASE_GAMES && csPerMin.mid !== null
        ? { rate: csPerMin.mid, when: "from 10 to 20 minutes" }
        : null;
  if (later && csPerMin.early && later.rate < csPerMin.early * CS_DROP) {
    found.push({
      title: "CS drops after laning",
      detail: `You farm ${csPerMin.early.toFixed(1)} CS a minute in the first 10 minutes but ${later.rate.toFixed(1)} ${later.when}.`,
      strength: 1 - later.rate / csPerMin.early,
    });
  }

  return found.sort((a, b) => b.strength - a.strength).slice(0, MAX_WEAKNESSES);
}

const EARLY_DEATH_TITLES: Record<DeathLabel, string> = {
  gank: "Getting ganked early",
  solo: "Losing early 1v1s",
  lane: "Losing early 2v2s",
  caught: "Caught out early",
  teamfight: "Dying in early fights",
  executed: "Dying to towers early",
};

// Finishes the sentence "7 of your 11 deaths before 14:00 came from ...".
const EARLY_DEATH_CAUSES: Record<DeathLabel, string> = {
  gank: "ganks",
  solo: "your opponent killing you alone",
  lane: "losing 2v2s in bot lane",
  caught: "getting caught away from your lane",
  teamfight: "teamfights",
  executed: "towers or minions",
};

function record(games: GameTrend[]): WinRecord {
  return { games: games.length, wins: games.filter((g) => g.win).length };
}

// The non-null values of one field.
function values(games: GameTrend[], pick: (g: GameTrend) => number | null): number[] {
  return games.map(pick).filter((v): v is number => v !== null);
}

function average(nums: number[]): number | null {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}
