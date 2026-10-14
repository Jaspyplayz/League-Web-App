import "server-only";

import type { MatchIdFilter } from "@/lib/queue-filters";
import { accountRegional, REGIONS, type Region } from "@/lib/regions";
import type { RiotId } from "@/lib/riot-id";
import type { ApexTier, Division, Tier } from "@/lib/tiers";
import { RiotApiError, riotGet } from "./client";
import type { Account, LeagueEntry, LeagueList, Match, Summoner, Timeline } from "./types";

// One function per Riot endpoint the app uses. Each picks the right host:
// account and match data live on regional clusters ("americas"), player data
// on platform servers ("na1"). See src/lib/regions.ts.

// Riot ID -> account (with the PUUID every other endpoint needs). Returns null
// when no such player exists, since that's an answer rather than a failure.
export async function getAccount(
  region: Region,
  { gameName, tagLine }: RiotId,
): Promise<Account | null> {
  const path = `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
  try {
    return await riotGet<Account>(accountRegional(region), path);
  } catch (error) {
    if (error instanceof RiotApiError && error.kind === "not-found") return null;
    throw error;
  }
}

export function getSummoner(region: Region, puuid: string) {
  return riotGet<Summoner>(
    REGIONS[region].platform,
    `/lol/summoner/v4/summoners/by-puuid/${puuid}`,
  );
}

export function getRankedEntries(region: Region, puuid: string) {
  return riotGet<LeagueEntry[]>(
    REGIONS[region].platform,
    `/lol/league/v4/entries/by-puuid/${puuid}`,
  );
}

// Ranked solo/duo is queue 420.
export const RANKED_SOLO_QUEUE = 420;

// A player's match IDs, newest first, at most 100 per request. With no
// filter it's every game mode. `startTime` and `endTime` (seconds since 1970)
// leave out games older or newer than that, and `start` skips that many.
export function getMatchIds(
  region: Region,
  puuid: string,
  count: number,
  filter: MatchIdFilter & { startTime?: number; endTime?: number; start?: number } = {},
) {
  const query = new URLSearchParams({ start: String(filter.start ?? 0), count: String(count) });
  if (filter.queue !== undefined) query.set("queue", String(filter.queue));
  if (filter.type) query.set("type", filter.type);
  if (filter.startTime !== undefined) query.set("startTime", String(filter.startTime));
  if (filter.endTime !== undefined) query.set("endTime", String(filter.endTime));
  return riotGet<string[]>(
    REGIONS[region].regional,
    `/lol/match/v5/matches/by-puuid/${puuid}/ids?${query}`,
  );
}

// The whole Master, Grandmaster or Challenger ladder of ranked solo/duo on
// one server. Challenger is the top ~300 players (200 on smaller servers).
export function getApexLeague(region: Region, tier: ApexTier) {
  return riotGet<LeagueList>(
    REGIONS[region].platform,
    `/lol/league/v4/${tier.toLowerCase()}leagues/by-queue/RANKED_SOLO_5x5`,
  );
}

// One page (about 200 players) of a ranked solo/duo division below Master,
// such as Gold II.
export function getLeagueEntries(
  region: Region,
  tier: Exclude<Tier, ApexTier>,
  division: Division,
  page = 1,
) {
  return riotGet<(LeagueEntry & { puuid: string })[]>(
    REGIONS[region].platform,
    `/lol/league/v4/entries/RANKED_SOLO_5x5/${tier}/${division}?page=${page}`,
  );
}

// A finished match never changes, so once we've downloaded one we keep it in
// memory and never ask Riot for it again. The Map holds the newest
// MAX_CACHED_MATCHES; on Vercel each server instance has its own, so this is a
// stopgap until matches are stored in the database.
const MAX_CACHED_MATCHES = 500;
const matchCache = new Map<string, Match>();

export async function getMatch(region: Region, matchId: string): Promise<Match> {
  const cached = matchCache.get(matchId);
  if (cached) return cached;

  const match = await riotGet<Match>(
    REGIONS[region].regional,
    `/lol/match/v5/matches/${encodeURIComponent(matchId)}`,
  );

  matchCache.set(matchId, match);
  if (matchCache.size > MAX_CACHED_MATCHES) {
    // Maps remember insertion order, so the first key is the oldest.
    matchCache.delete(matchCache.keys().next().value!);
  }
  return match;
}

// The minute-by-minute timeline of a match. Large (a few hundred KB), so it's
// only fetched when someone opens that match, then trimmed and stored; see
// src/lib/match-store.ts.
export function getTimeline(region: Region, matchId: string) {
  return riotGet<Timeline>(
    REGIONS[region].regional,
    `/lol/match/v5/matches/${encodeURIComponent(matchId)}/timeline`,
  );
}
