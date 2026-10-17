import "server-only";

import * as Sentry from "@sentry/nextjs";
import { and, count, eq, gte, inArray } from "drizzle-orm";
import { tables } from "@/db";
import { analyzeMatch, findPlayer, isAnalyzable } from "@/lib/analyzer";
import { recapFacts } from "@/lib/analyzer/recap-facts";
import { championName, getDataDragon } from "@/lib/ddragon";
import { scoreGame } from "@/lib/game-score";
import { database, loadMatch, loadTimeline, readCache } from "@/lib/match-store";
import { savedSoloTier } from "@/lib/profile-store";
import { RECAP_MODEL, writeRecap, type Recap } from "@/lib/recap";
import type { Region } from "@/lib/regions";
import { matchWinChance } from "@/lib/win-chance";

// Reads and writes AI recaps in the match_recaps table (see src/db/schema.ts).

// New recaps one account can ask for in 24 hours. Each costs under a tenth of
// a cent, so this isn't about a normal player's bill: it stops one account
// from writing recaps for thousands of games.
export const RECAPS_PER_DAY = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function readRecap(matchId: string, puuid: string): Promise<Recap | null> {
  const row = await readCache((db) =>
    db.query.matchRecaps.findFirst({
      columns: { headline: true, detail: true },
      where: and(eq(tables.matchRecaps.matchId, matchId), eq(tables.matchRecaps.puuid, puuid)),
    }),
  );
  return row ?? null;
}

// One player's recap headlines for a list of games, by match ID, for the Log tab.
export async function readRecapHeadlines(
  puuid: string,
  matchIds: string[],
): Promise<Map<string, string>> {
  if (matchIds.length === 0) return new Map();
  const rows = await readCache((db) =>
    db.query.matchRecaps.findMany({
      columns: { matchId: true, headline: true },
      where: and(
        eq(tables.matchRecaps.puuid, puuid),
        inArray(tables.matchRecaps.matchId, matchIds),
      ),
    }),
  );
  return new Map((rows ?? []).map((r) => [r.matchId, r.headline]));
}

export type CreateRecapResult =
  | { status: "written"; recap: Recap }
  | { status: "failed"; message: string };

// Writes and saves the recap of one game from one player's side, unless it
// already exists. Everything is worked out again here from the stored match,
// never taken from the browser, so nobody can feed Claude made-up facts.
export async function createRecap(
  region: Region,
  matchId: string,
  puuid: string,
  userId: string,
): Promise<CreateRecapResult> {
  const db = database();
  if (!db) return { status: "failed", message: "Recaps aren't available right now." };

  const existing = await readRecap(matchId, puuid);
  if (existing) return { status: "written", recap: existing };

  try {
    const [asked] = await db
      .select({ n: count() })
      .from(tables.matchRecaps)
      .where(
        and(
          eq(tables.matchRecaps.createdBy, userId),
          gte(tables.matchRecaps.createdAt, new Date(Date.now() - DAY_MS)),
        ),
      );
    if (asked.n >= RECAPS_PER_DAY) {
      return {
        status: "failed",
        message: `You've written ${RECAPS_PER_DAY} recaps today. Try again tomorrow.`,
      };
    }

    const match = await loadMatch(region, matchId);
    const me = findPlayer(match, puuid);
    if (!me || !isAnalyzable(match)) {
      return { status: "failed", message: "This game is too short to recap." };
    }
    const [timeline, dd, tier] = await Promise.all([
      loadTimeline(region, match),
      getDataDragon().catch(() => null),
      savedSoloTier(puuid),
    ]);
    const label = (name: string) => championName(dd, name);
    const analysis = analyzeMatch(match, timeline, puuid, label)!;
    // The same rank's model as the match page, so the recap's swings match it.
    const swings = matchWinChance(match, timeline, me.teamId, tier)?.swings ?? null;
    const score = scoreGame(match).get(me.participantId) ?? null;

    const recap = await writeRecap(recapFacts(match, analysis, swings, score, label));
    if (!recap) return { status: "failed", message: "Couldn't write a recap for this game." };

    await db
      .insert(tables.matchRecaps)
      .values({ matchId, puuid, ...recap, model: RECAP_MODEL, createdBy: userId })
      // Two clicks at once: keep the first recap.
      .onConflictDoNothing();
    return { status: "written", recap };
  } catch (error) {
    Sentry.captureException(error);
    return { status: "failed", message: "Couldn't write the recap. Try again in a moment." };
  }
}
