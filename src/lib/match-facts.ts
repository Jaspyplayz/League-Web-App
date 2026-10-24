import "server-only";

import { analyzeMatch, findPlayer, isAnalyzable } from "@/lib/analyzer";
import { recapFacts, type RecapFacts } from "@/lib/analyzer/recap-facts";
import { championName, getDataDragon } from "@/lib/ddragon";
import { scoreGame } from "@/lib/game-score";
import { loadTimeline } from "@/lib/match-store";
import { savedSoloTier } from "@/lib/profile-store";
import type { Region } from "@/lib/regions";
import type { Match } from "@/lib/riot/types";
import { matchWinChance } from "@/lib/win-chance";

// The short list of numbers the analyzer works out for one game from one
// player's side: lane gaps at 10 and 15, turning points, win chance swings,
// deaths, objectives, the game score and, for junglers, ganks and pathing.
// Both AI features read this instead of the raw match: the recap
// (src/lib/recap-store.ts) and the MCP server (src/lib/mcp/tools.ts).
//
// Returns null when the player isn't in the match or the game isn't analyzed
// (see whyNotAnalyzed). Costs one Riot call if the timeline isn't saved yet.
export async function loadMatchFacts(
  region: Region,
  match: Match,
  puuid: string,
): Promise<RecapFacts | null> {
  const me = findPlayer(match, puuid);
  if (!me || !isAnalyzable(match)) return null;

  const [timeline, dd, tier] = await Promise.all([
    loadTimeline(region, match),
    getDataDragon().catch(() => null),
    savedSoloTier(puuid),
  ]);
  const label = (name: string) => championName(dd, name);
  const analysis = analyzeMatch(match, timeline, puuid, label)!;
  // The same rank's model as the match page, so the swings match it.
  const swings = matchWinChance(match, timeline, me.teamId, tier)?.swings ?? null;
  const score = scoreGame(match).get(me.participantId) ?? null;
  return recapFacts(match, analysis, swings, score, label);
}
