import "server-only";

import { accountRegional, REGIONS, type Region } from "@/lib/regions";
import type { RiotId } from "@/lib/riot-id";
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

// Ranked solo/duo is queue 420. Leave `queue` out to get every game mode.
export const RANKED_SOLO_QUEUE = 420;

export function getMatchIds(region: Region, puuid: string, count: number, queue?: number) {
  const onlyQueue = queue === undefined ? "" : `&queue=${queue}`;
  return riotGet<string[]>(
    REGIONS[region].regional,
    `/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=${count}${onlyQueue}`,
  );
}

// The Challenger tier of ranked solo/duo on one server: its top ~300 players
// (200 on smaller servers).
export function getChallengerLeague(region: Region) {
  return riotGet<LeagueList>(
    REGIONS[region].platform,
    "/lol/league/v4/challengerleagues/by-queue/RANKED_SOLO_5x5",
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
