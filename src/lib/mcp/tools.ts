import "server-only";

import { whyNotAnalyzed } from "@/lib/analyzer";
import { championName, getDataDragon } from "@/lib/ddragon";
import { loadMatchFacts } from "@/lib/match-facts";
import { loadMatch, loadMatches } from "@/lib/match-store";
import { summarizeMatch, topChampions, type MatchSummary } from "@/lib/match-summary";
import { loadProfile, PROFILE_MATCH_COUNT } from "@/lib/profile-store";
import { isMatchIdFor, REGIONS, type Region } from "@/lib/regions";
import { getAccount, getMatchIds } from "@/lib/riot/api";
import { parseRiotId, toSlug } from "@/lib/riot-id";
import type { Account, Match } from "@/lib/riot/types";
import { gameAnswer, rankAnswers, recordAnswer } from "./answers";

// What each MCP tool does (see src/app/api/mcp/route.ts). They reuse the
// same loaders as the website, so an answer costs the same Riot calls as
// opening that page: nothing for what's already saved in Postgres.
//
// Riot errors are thrown as RiotApiError and turned into a message for
// Claude by the route. A "not an answer" result, like a misspelled Riot ID,
// is returned as { message } instead.

// At most this many games that aren't saved yet are fetched from Riot per
// tool call, so one question can't use up the rate limit the website shares.
// Games past the cap are reported as `notLoadedYet`; asking again loads more.
export const NEW_MATCHES_PER_CALL = 10;

// Riot returns at most 100 match IDs per request, but a chat answer doesn't
// need that many, and each new game costs a call.
export const MAX_RECENT_GAMES = 20;

type Answer<T> = T | { message: string };

// Where the website's pages live, for links in Claude's answers.
type Links = { origin: string };

export async function lookUpPlayer(
  region: Region,
  riotId: string,
  { origin }: Links,
): Promise<Answer<object>> {
  const account = await findAccount(region, riotId);
  if ("message" in account) return account;

  const profile = await loadProfile(region, account);
  const { games, notLoadedYet, label } = await loadGames(region, account.puuid, profile.matchIds);
  return {
    riotId: `${account.gameName}#${account.tagLine}`,
    region: REGIONS[region].label,
    profileUrl: `${origin}${playerPath(region, account)}`,
    level: profile.summonerLevel,
    ranks: rankAnswers(profile.ranked),
    lastGames: recordAnswer(games),
    mostPlayed: topChampions(games, 3).map((c) => ({
      champion: label(c.championName),
      games: c.games,
      wins: c.wins,
    })),
    notLoadedYet,
  };
}

export async function recentGames(
  region: Region,
  riotId: string,
  count: number,
  { origin }: Links,
): Promise<Answer<object>> {
  const account = await findAccount(region, riotId);
  if ("message" in account) return account;
  return recentGamesFor(region, account, count, { origin });
}

// The same as recentGames, for a player already looked up. The Ask tab
// (src/lib/ask.ts) uses it, so each question looks the Riot ID up only once.
export async function recentGamesFor(
  region: Region,
  account: Account,
  count: number,
  { origin }: Links,
): Promise<Answer<object>> {
  // The profile's saved list covers the latest 10 games at no Riot cost;
  // more than that needs one call for the longer list.
  const profile = await loadProfile(region, account);
  const ids =
    count <= PROFILE_MATCH_COUNT
      ? profile.matchIds.slice(0, count)
      : await getMatchIds(region, account.puuid, count);
  const { games, notLoadedYet, label } = await loadGames(region, account.puuid, ids);

  const path = playerPath(region, account);
  const matchUrl = (matchId: string) => `${origin}${path}/match/${matchId}`;
  return {
    riotId: `${account.gameName}#${account.tagLine}`,
    record: recordAnswer(games),
    games: games.map((g) => gameAnswer(g, matchUrl, label)),
    notLoadedYet,
  };
}

export async function analyzeGame(
  region: Region,
  riotId: string,
  matchId: string,
  { origin }: Links,
): Promise<Answer<object>> {
  // Checked before any Riot call, so a made-up ID costs nothing.
  if (!isMatchIdFor(region, matchId)) return wrongRegion(region, matchId);
  const account = await findAccount(region, riotId);
  if ("message" in account) return account;
  return analyzeGameFor(region, account, matchId, { origin });
}

// The same as analyzeGame, for a player already looked up (see recentGamesFor).
export async function analyzeGameFor(
  region: Region,
  account: Account,
  matchId: string,
  { origin }: Links,
): Promise<Answer<object>> {
  if (!isMatchIdFor(region, matchId)) return wrongRegion(region, matchId);
  const match = await loadMatch(region, matchId);
  if (!match.info.participants.some((p) => p.puuid === account.puuid)) {
    return { message: `${account.gameName}#${account.tagLine} didn't play in ${matchId}.` };
  }
  const facts = await loadMatchFacts(region, match, account.puuid);
  if (!facts) {
    return { message: whyNotAnalyzed(match) ?? "There's no analysis for this game." };
  }
  return {
    matchId,
    url: `${origin}${playerPath(region, account)}/match/${matchId}`,
    ...facts,
  };
}

function wrongRegion(region: Region, matchId: string) {
  return {
    message: `${matchId} isn't a match ID from ${REGIONS[region].label}. Use one from recent_games.`,
  };
}

async function findAccount(region: Region, riotId: string): Promise<Answer<Account>> {
  const id = parseRiotId(riotId);
  if (!id) return { message: `"${riotId}" isn't a Riot ID. It should look like Name#TAG.` };
  const account = await getAccount(region, id);
  if (!account) return { message: `There's no ${riotId} in ${REGIONS[region].label}.` };
  return account;
}

// Summaries of the games, newest first, plus how many couldn't be loaded
// within NEW_MATCHES_PER_CALL.
async function loadGames(region: Region, puuid: string, ids: string[]) {
  const [loaded, dd] = await Promise.all([
    loadMatches(region, ids, NEW_MATCHES_PER_CALL),
    getDataDragon().catch(() => null),
  ]);
  // A refusal from Riot partway through still answers with what loaded.
  const games = loaded.matches
    .map((m: Match) => summarizeMatch(m, puuid))
    .filter((g): g is MatchSummary => g !== null);
  const label = (name: string) => championName(dd, name);
  return { games, notLoadedYet: loaded.waiting, label };
}

function playerPath(region: Region, account: Account): string {
  return `/player/${region}/${toSlug(account)}`;
}
