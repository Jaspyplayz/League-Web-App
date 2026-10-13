// Pure functions that turn Riot's raw match data into the numbers the profile
// page shows. No network calls here, so they're easy to unit test.

import type { LeagueEntry, Match } from "@/lib/riot/types";

// Queue IDs: https://static.developer.riotgames.com/docs/lol/queues.json
const QUEUES: Record<number, string> = {
  400: "Normal Draft",
  420: "Ranked Solo",
  430: "Normal Blind",
  440: "Ranked Flex",
  450: "ARAM",
  480: "Swiftplay",
  490: "Quickplay",
  900: "ARURF",
  1700: "Arena",
  1900: "URF",
};

export function queueName(queueId: number): string {
  return QUEUES[queueId] ?? "Other";
}

const POSITIONS: Record<string, string> = {
  TOP: "Top",
  JUNGLE: "Jungle",
  MIDDLE: "Mid",
  BOTTOM: "Bot",
  UTILITY: "Support",
};

// "JUNGLE" -> "Jungle". Null for an empty or unknown position.
export function positionName(position: string): string | null {
  return POSITIONS[position] ?? null;
}

// Games shorter than this are treated as remakes when Riot doesn't say.
const REMAKE_SECONDS = 5 * 60;

export type MatchSummary = {
  matchId: string;
  queue: string;
  startedAt: number;
  durationS: number;
  remake: boolean;
  win: boolean;
  championName: string;
  position: string | null;
  kills: number;
  deaths: number;
  assists: number;
  kda: number;
  cs: number;
  csPerMin: number;
  killParticipation: number; // 0 to 1
  items: number[]; // 7 slots, 0 = empty, the last one is the trinket
  spells: [number, number]; // summoner spell ids
};

export function gameDurationSeconds(info: Match["info"]): number {
  // Riot switched gameDuration from milliseconds to seconds in late 2021, and
  // games from after the switch are the ones that have gameEndTimestamp.
  return info.gameEndTimestamp ? info.gameDuration : Math.round(info.gameDuration / 1000);
}

export function kdaRatio(kills: number, deaths: number, assists: number): number {
  return (kills + assists) / Math.max(1, deaths);
}

// Returns null if the player isn't in this match (shouldn't happen, but the
// data comes from outside, so don't trust it blindly).
export function summarizeMatch(match: Match, puuid: string): MatchSummary | null {
  const { info } = match;
  const me = info.participants.find((p) => p.puuid === puuid);
  if (!me) return null;

  const durationS = gameDurationSeconds(info);
  const cs = me.totalMinionsKilled + me.neutralMinionsKilled;
  const teamKills = info.participants
    .filter((p) => p.teamId === me.teamId)
    .reduce((sum, p) => sum + p.kills, 0);

  return {
    matchId: match.metadata.matchId,
    queue: queueName(info.queueId),
    startedAt: info.gameStartTimestamp,
    durationS,
    remake: me.gameEndedInEarlySurrender ?? durationS < REMAKE_SECONDS,
    win: me.win,
    championName: me.championName,
    position: positionName(me.teamPosition),
    kills: me.kills,
    deaths: me.deaths,
    assists: me.assists,
    kda: kdaRatio(me.kills, me.deaths, me.assists),
    cs,
    csPerMin: durationS > 0 ? cs / (durationS / 60) : 0,
    killParticipation: teamKills > 0 ? (me.kills + me.assists) / teamKills : 0,
    items: [me.item0, me.item1, me.item2, me.item3, me.item4, me.item5, me.item6],
    spells: [me.summoner1Id, me.summoner2Id],
  };
}

export type RecentRecord = {
  games: number;
  wins: number;
  losses: number;
  kda: number;
  csPerMin: number;
  killParticipation: number;
};

// Totals across recent games. Remakes are left out because nobody won or lost
// them in a meaningful way.
export function summarizeRecord(matches: MatchSummary[]): RecentRecord {
  const played = matches.filter((m) => !m.remake);
  const sum = (pick: (m: MatchSummary) => number) =>
    played.reduce((total, m) => total + pick(m), 0);
  const average = (pick: (m: MatchSummary) => number) =>
    played.length > 0 ? sum(pick) / played.length : 0;

  const wins = played.filter((m) => m.win).length;
  return {
    games: played.length,
    wins,
    losses: played.length - wins,
    // Overall KDA uses totals, so one 10/0/10 game doesn't skew it.
    kda: kdaRatio(
      sum((m) => m.kills),
      sum((m) => m.deaths),
      sum((m) => m.assists),
    ),
    csPerMin: average((m) => m.csPerMin),
    killParticipation: average((m) => m.killParticipation),
  };
}

export type ChampionStats = { championName: string; games: number; wins: number; kda: number };

// Most-played champions in recent games, most games first.
export function topChampions(matches: MatchSummary[], limit: number): ChampionStats[] {
  const byChampion = new Map<string, MatchSummary[]>();
  for (const m of matches) {
    if (m.remake) continue;
    byChampion.set(m.championName, [...(byChampion.get(m.championName) ?? []), m]);
  }
  return [...byChampion.entries()]
    .map(([championName, games]) => {
      const record = summarizeRecord(games);
      return { championName, games: record.games, wins: record.wins, kda: record.kda };
    })
    .sort((a, b) => b.games - a.games || b.wins - a.wins)
    .slice(0, limit);
}

export function winRate(wins: number, losses: number): number {
  const games = wins + losses;
  return games > 0 ? wins / games : 0;
}

const APEX_TIERS = new Set(["MASTER", "GRANDMASTER", "CHALLENGER"]);

// "GOLD", "II" -> "Gold II". Master and above have no divisions.
export function formatTier({ tier, rank }: Pick<LeagueEntry, "tier" | "rank">): string {
  const name = tier.charAt(0) + tier.slice(1).toLowerCase();
  return APEX_TIERS.has(tier) ? name : `${name} ${rank}`;
}

export function findQueue(entries: LeagueEntry[], queueType: string) {
  return entries.find((e) => e.queueType === queueType) ?? null;
}

// 1902 -> "31:42"
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// How long ago, rounded down to the biggest whole unit: "5m ago", "3h ago".
export function timeAgo(timestamp: number, now: number): string {
  const minutes = Math.floor((now - timestamp) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}
