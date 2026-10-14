// Trends across a player's recent games: the "Insights" page. Each game is
// first boiled down to a few numbers (summarizeGame), then the games are
// rolled up together (computeTrends). See docs/match-analyzer.md, "Across
// games".
//
// Like the rest of the analyzer, everything is measured against the enemy in
// the same role in the same game, so it works for every role, jungle included.

import { gameDurationSeconds } from "@/lib/match-summary";
import type { Match } from "@/lib/riot/types";
import { EARLY_DEATH_MS, findDeaths, type DeathLabel } from "./deaths";
import { findPlayer, isAnalyzable } from "./index";
import { inLane } from "./map";
import { findOpponent, playedPosition, playerAt, snapshotAt } from "./matchup";
import { findObjectives } from "./objectives";
import { enemyHalfShare, strongerSideShare } from "./roaming";
import type { ChampionKill, TrimmedEvent, TrimmedFrame, TrimmedTimeline } from "./trim";

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

  // The stats below are null when they don't apply to the role, and in
  // benchmark games collected before they were added (see compare.ts).

  // Your XP minus your opponent's at 15 minutes.
  xpAt15: number | null;
  // Kills plus assists before 14:00.
  earlyTakedowns: number | null;
  visionPerMin: number | null;
  // Junglers and supports only (see roaming.ts), as a share from 0 to 1:
  // minutes on the side of the map whose lane was clearly stronger, and
  // minutes past the halfway line, both from 3:00 to 15:00.
  strongerSide: number | null;
  enemyHalf: number | null;
  // Junglers only. Kills plus assists in a lane before 14:00.
  gankTakedowns: number | null;
  // Junglers only. The share of dragons, void grub groups and Rift Heralds
  // your team took, from 0 to 1.
  objectiveShare: number | null;
  // Junglers only, from Riot's own per-game counts.
  enemyJungleKills: number | null;
  scuttles: number | null;
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
  const position = playedPosition(me);
  const jungle = position === "JUNGLE";
  // Junglers and supports move around the map; laners mostly stay in lane.
  const roams = jungle || position === "UTILITY";
  const earlyTakedowns = takedowns(events, meId).filter((k) => k.timestamp < EARLY_DEATH_MS);

  return {
    matchId: match.metadata.matchId,
    startedAt: match.info.gameStartTimestamp,
    win: me.win,
    championName: me.championName,
    position,
    goldAt10: at10 ? at10.you.gold - at10.opponent.gold : null,
    csAt10: at10 ? at10.you.cs - at10.opponent.cs : null,
    goldAt15: at15 ? at15.you.gold - at15.opponent.gold : null,
    earlyDeaths: deaths.filter((d) => d.early).map((d) => d.label),
    csPerMin: csByPhase(frames, meId),
    xpAt15: at15 ? at15.you.xp - at15.opponent.xp : null,
    earlyTakedowns: earlyTakedowns.length,
    visionPerMin: me.visionScore / (gameDurationSeconds(match.info) / 60),
    strongerSide: roams ? strongerSideShare(frames, participants, me) : null,
    enemyHalf: roams ? enemyHalfShare(frames, me) : null,
    gankTakedowns: jungle
      ? earlyTakedowns.filter((k) => k.position && inLane(k.position)).length
      : null,
    objectiveShare: jungle ? objectiveShare(events, me.teamId) : null,
    enemyJungleKills: jungle ? (me.challenges?.enemyJungleMonsterKills ?? null) : null,
    scuttles: jungle ? (me.challenges?.scuttleCrabKills ?? null) : null,
  };
}

// The champion kills you got or assisted in.
function takedowns(events: TrimmedEvent[], meId: number): ChampionKill[] {
  return events.filter(
    (e): e is ChampionKill =>
      e.type === "CHAMPION_KILL" &&
      (e.killerId === meId || e.assistingParticipantIds.includes(meId)),
  );
}

// Of the dragons, void grub groups and Rift Heralds anyone took, the share
// your team got. Null when nobody took any.
function objectiveShare(events: TrimmedEvent[], myTeamId: number): number | null {
  const taken = findObjectives(events, myTeamId).filter(
    (o) => o.kind === "dragon" || o.kind === "grubs" || o.kind === "herald",
  );
  return taken.length ? taken.filter((o) => o.ours).length / taken.length : null;
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

// Each weakness rule has a stable id, so a player can pick one as their focus
// and see it checked game by game (see src/lib/focus.ts). Early deaths get one
// id per kind of death, since each kind is its own habit.
export type WeaknessId =
  | "behind-at-10"
  | "behind-in-cs"
  | "leads-slip"
  | "cs-drop"
  | `early-${DeathLabel}`;

export type Weakness = {
  id: WeaknessId;
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
      id: "behind-at-10",
      title: "Behind at 10 minutes",
      detail: `You're behind your opponent in gold at 10 minutes in ${laning.behindInGold} of ${laning.games} games.`,
      strength: laning.behindInGold / laning.games,
    });
  }

  if (laning.csGames >= MIN_GAMES_FOR_WEAKNESSES && laning.behindInCs / laning.csGames > MAJORITY) {
    found.push({
      id: "behind-in-cs",
      title: "Losing the CS race",
      detail: `You have less CS than your opponent at 10 minutes in ${laning.behindInCs} of ${laning.csGames} games.`,
      strength: laning.behindInCs / laning.csGames,
    });
  }

  const at15 = conversion.find((c) => c.minute === 15)!.ahead;
  if (at15.games >= MIN_LEADS && at15.wins / at15.games < LOW_CONVERSION) {
    found.push({
      id: "leads-slip",
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
      id: `early-${top.label}`,
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
      id: "cs-drop",
      title: "CS drops after the early game",
      detail: `You farm ${csPerMin.early.toFixed(1)} CS a minute in the first 10 minutes but ${later.rate.toFixed(1)} ${later.when}.`,
      strength: 1 - later.rate / csPerMin.early,
    });
  }

  return found.sort((a, b) => b.strength - a.strength).slice(0, MAX_WEAKNESSES);
}

// The same rules as findWeaknesses, for one game at a time: true when the
// game shows the weakness, false when you avoided it, and null when the game
// can't say (it ended before the minute that matters, you played support for a
// CS rule, or you weren't ahead at 15 for "leads slip away").
export function showsWeakness(game: GameTrend, id: WeaknessId): boolean | null {
  switch (id) {
    case "behind-at-10":
      return game.goldAt10 === null ? null : game.goldAt10 < 0;
    case "behind-in-cs":
      return game.position === "UTILITY" || game.csAt10 === null ? null : game.csAt10 < 0;
    case "leads-slip":
      return game.goldAt15 !== null && game.goldAt15 > 0 ? !game.win : null;
    case "cs-drop": {
      if (game.position === "UTILITY") return null;
      // Like the weakness, use the latest phase the game reached.
      const later = game.csPerMin.late ?? game.csPerMin.mid;
      return later === null ? null : later < game.csPerMin.early * CS_DROP;
    }
    default: {
      // Every other id is "early-" plus a kind of death.
      const label = id.slice("early-".length) as DeathLabel;
      return game.earlyDeaths.includes(label);
    }
  }
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
  // Junglers have no lane, so every death to one or two enemies other than
  // the enemy jungler counts as caught for them. Keep this role-neutral.
  caught: "getting caught out by one or two enemies",
  teamfight: "teamfights",
  executed: "towers or minions",
};

// Every weakness id, for checking each game against whichever one a player
// has picked as their focus. The pick lives in the browser, so the server
// can't know which one it is and checks them all.
export const WEAKNESS_IDS: WeaknessId[] = [
  "behind-at-10",
  "behind-in-cs",
  "leads-slip",
  "cs-drop",
  ...(Object.keys(EARLY_DEATH_TITLES) as DeathLabel[]).map((label) => `early-${label}` as const),
];

export function checkWeaknesses(game: GameTrend): Record<WeaknessId, boolean | null> {
  return Object.fromEntries(WEAKNESS_IDS.map((id) => [id, showsWeakness(game, id)])) as Record<
    WeaknessId,
    boolean | null
  >;
}

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
