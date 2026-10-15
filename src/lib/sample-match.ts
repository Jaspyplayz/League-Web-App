import { toSlug } from "@/lib/riot-id";

// One real game kept in the database, so visitors can always see a full
// analysis. Finished matches and timelines are cached forever (see
// src/lib/match-store.ts), and the player's name matches the URL, so this page
// needs no Riot call at all. It keeps working when the development API key
// has expired, which is exactly when a live lookup fails.
//
// Faker's Syndra win (9/2/10, 24 minutes) on patch 16.20.
export const SAMPLE_MATCH = {
  region: "kr",
  gameName: "Hide on bush",
  tagLine: "KR1",
  matchId: "KR_8416261221",
} as const;

export const SAMPLE_MATCH_HREF = `/player/${SAMPLE_MATCH.region}/${toSlug(SAMPLE_MATCH)}/match/${SAMPLE_MATCH.matchId}`;
