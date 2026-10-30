"use server";

import type { ReactNode } from "react";
import { MatchDetails } from "@/components/match-details";
import { getDataDragon } from "@/lib/ddragon";
import { loadMatch } from "@/lib/match-store";
import { isMatchIdFor, isRegion } from "@/lib/regions";
import { isPlayerPath } from "@/lib/riot-id";

// The panel under a match row on the profile, rendered when the row first
// opens instead of with the page (see src/components/expandable-row.tsx).
// The profile saved the match when it listed it, so this reads it from the
// database; only a game whose save hasn't finished yet costs a Riot call.
//
// Anyone can call a Server Action with any arguments, so they're checked
// first, as in actions.ts. A failed check or load throws, and the row shows
// "Try again".
export async function loadMatchDetailsAction(
  region: string,
  matchId: string,
  puuid: string,
  playerPath: string,
): Promise<ReactNode> {
  if (
    !isRegion(region) ||
    typeof matchId !== "string" ||
    !isMatchIdFor(region, matchId) ||
    typeof puuid !== "string" ||
    typeof playerPath !== "string" ||
    !isPlayerPath(region, playerPath)
  ) {
    throw new Error("Not a match on this player's page");
  }

  const [match, dd] = await Promise.all([
    loadMatch(region, matchId),
    getDataDragon().catch(() => null),
  ]);
  return (
    <MatchDetails
      region={region}
      dd={dd}
      match={match}
      puuid={puuid}
      analysisHref={`${playerPath}/match/${matchId}`}
    />
  );
}
