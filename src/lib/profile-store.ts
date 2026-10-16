import "server-only";

import * as Sentry from "@sentry/nextjs";
import { and, desc, eq, gte, lt } from "drizzle-orm";
import { tables } from "@/db";
import { isFresh, secondsUntilUpdate, TTL_MS } from "@/db/freshness";
import { database, readCache } from "@/lib/match-store";
import { GRAPH_DAYS, ranksToRecord, type RankPoint } from "@/lib/rank-history";
import type { Region } from "@/lib/regions";
import { getMatchIds, getRankedEntries, getSummoner } from "@/lib/riot/api";
import { RiotApiError, settle, type RiotErrorKind } from "@/lib/riot/client";
import type { Account, LeagueEntry } from "@/lib/riot/types";

// A player's profile works like op.gg's: it's a snapshot saved in Postgres.
// Turnpoint asks Riot for a new one the first time anyone opens the player,
// when the saved one is a day old, or when someone clicks Update. Visits in
// between read the snapshot and cost no Riot calls for rank or match history.
//
// Like match-store.ts, the database is only a cache: without one, every
// visit fetches a fresh profile from Riot.

export type Profile = {
  profileIconId: number | null;
  summonerLevel: number | null;
  ranked: LeagueEntry[];
  // The latest games, newest first. The matches themselves are loaded with
  // loadMatches, which only asks Riot for games it hasn't stored yet.
  matchIds: string[];
  // When this snapshot was fetched from Riot.
  updatedAt: Date;
};

// Each game listed costs one Riot call the first time anyone sees it.
export const PROFILE_MATCH_COUNT = 10;

// Throws a RiotApiError if there's no saved snapshot and Riot can't be reached.
export async function loadProfile(region: Region, account: Account): Promise<Profile> {
  const saved = await readProfile(region, account.puuid);
  if (saved && isFresh(saved.updatedAt, TTL_MS.profile)) return saved;

  try {
    return await fetchProfile(region, account);
  } catch (error) {
    // Riot is down or busy: a day-old profile beats an error message.
    if (saved && error instanceof RiotApiError) return saved;
    throw error;
  }
}

export type UpdateResult =
  | { status: "updated" }
  | { status: "cooldown"; secondsLeft: number }
  | { status: "failed"; kind: RiotErrorKind };

// What the Update button runs. Only refreshes a player whose profile is
// already saved, so it can't be used to make Turnpoint fetch arbitrary
// PUUIDs, and at most once per TTL_MS.updateCooldown.
export async function updateProfile(region: Region, puuid: string): Promise<UpdateResult> {
  const player = await readCache((db) =>
    db.query.players.findFirst({ where: eq(tables.players.puuid, puuid) }),
  );
  // No database, or nothing saved yet: the page fetches a fresh profile on
  // its own when it reloads, so there's nothing to do here.
  if (!player) return { status: "updated" };

  const secondsLeft = secondsUntilUpdate(player.matchIdsFetchedAt);
  if (secondsLeft > 0) return { status: "cooldown", secondsLeft };

  const result = await settle(fetchProfile(region, player));
  return result.ok ? { status: "updated" } : { status: "failed", kind: result.error.kind };
}

// Asks Riot for everything on the profile at once (3 calls) and saves it.
async function fetchProfile(region: Region, account: Account): Promise<Profile> {
  const { puuid } = account;
  const [summoner, ranked, matchIds] = await Promise.all([
    // The icon and level are nice to have, so the page still works without
    // them (for example when the player has never played in this region).
    settle(getSummoner(region, puuid)),
    getRankedEntries(region, puuid),
    getMatchIds(region, puuid, PROFILE_MATCH_COUNT),
  ]);

  const profile: Profile = {
    profileIconId: summoner.ok ? summoner.value.profileIconId : null,
    summonerLevel: summoner.ok ? summoner.value.summonerLevel : null,
    ranked,
    matchIds,
    updatedAt: new Date(),
  };
  // Saved before returning, not after the response like matches are: after
  // an Update the page reloads straight away and must read the new snapshot.
  await saveProfile(region, account, profile);
  return profile;
}

// The player's saved solo queue tier ("GOLD"), so the match page can use
// the win chance model for their rank. It's their rank now, not when the
// game was played, which is close enough for recent games. Null when
// they're unranked in solo queue or haven't been looked up. No Riot calls.
export async function savedSoloTier(puuid: string): Promise<string | null> {
  const entry = await readCache((db) =>
    db.query.rankedEntries.findFirst({
      where: and(
        eq(tables.rankedEntries.puuid, puuid),
        eq(tables.rankedEntries.queueType, "RANKED_SOLO_5x5"),
      ),
      columns: { tier: true },
    }),
  );
  return entry?.tier ?? null;
}

async function readProfile(region: Region, puuid: string): Promise<Profile | undefined> {
  return readCache(async (db) => {
    const player = await db.query.players.findFirst({
      where: eq(tables.players.puuid, puuid),
    });
    // Rank and level belong to one server, so a profile saved for another
    // region (the same account looked up on EUW, say) doesn't count.
    if (!player?.matchIdsFetchedAt || !player.matchIds || player.region !== region) {
      return undefined;
    }

    const ranked = await db.query.rankedEntries.findMany({
      where: eq(tables.rankedEntries.puuid, puuid),
      columns: {
        queueType: true,
        tier: true,
        rank: true,
        leaguePoints: true,
        wins: true,
        losses: true,
      },
    });
    return {
      profileIconId: player.profileIconId,
      summonerLevel: player.summonerLevel,
      ranked,
      matchIds: player.matchIds,
      updatedAt: player.matchIdsFetchedAt,
    };
  });
}

async function saveProfile(region: Region, account: Account, profile: Profile) {
  const db = database();
  if (!db) return;

  const { puuid, gameName, tagLine } = account;
  const { updatedAt } = profile;
  const row = {
    gameName,
    tagLine,
    region,
    profileIconId: profile.profileIconId,
    summonerLevel: profile.summonerLevel,
    matchIds: profile.matchIds,
    fetchedAt: updatedAt,
    rankedFetchedAt: updatedAt,
    matchIdsFetchedAt: updatedAt,
  };
  try {
    // One transaction, so a reader never sees the new rank with the old
    // player row or the other way round.
    await db.transaction(async (tx) => {
      await tx
        .insert(tables.players)
        .values({ puuid, ...row })
        .onConflictDoUpdate({ target: tables.players.puuid, set: row });
      // Replace the rank rows rather than update them: a player who dropped
      // out of a queue (or never played it) has no row for it.
      await tx.delete(tables.rankedEntries).where(eq(tables.rankedEntries.puuid, puuid));
      if (profile.ranked.length > 0) {
        await tx.insert(tables.rankedEntries).values(
          profile.ranked.map((e) => ({
            puuid,
            queueType: e.queueType,
            tier: e.tier,
            rank: e.rank,
            leaguePoints: e.leaguePoints,
            wins: e.wins,
            losses: e.losses,
            fetchedAt: updatedAt,
          })),
        );
      }
    });
  } catch (error) {
    // The page still has the fresh profile to show; it just isn't saved.
    Sentry.captureException(error);
    return;
  }

  // Kept out of the transaction above on purpose: if this fails (say the
  // rank_history table hasn't been created yet), the profile is still saved
  // and only the LP graph misses a point.
  try {
    // Keep a dated copy of each rank that changed. The latest few rows are
    // enough to find each queue's last one.
    const latest = await db
      .select()
      .from(tables.rankHistory)
      .where(eq(tables.rankHistory.puuid, puuid))
      .orderBy(desc(tables.rankHistory.recordedAt))
      .limit(10);
    const changed = ranksToRecord(latest, profile.ranked);
    if (changed.length > 0) {
      await db
        .insert(tables.rankHistory)
        .values(changed.map((e) => ({ puuid, ...pickRank(e), recordedAt: updatedAt })));
    }
  } catch (error) {
    Sentry.captureException(error);
  }
}

// Only the columns rank_history stores; Riot's entries carry more fields.
function pickRank(e: LeagueEntry) {
  const { queueType, tier, rank, leaguePoints, wins, losses } = e;
  return { queueType, tier, rank, leaguePoints, wins, losses };
}

// The saved rank history for the LP graph: the last GRAPH_DAYS days, plus the
// last row before them so the line can start at the left edge. Empty without
// a database. Costs no Riot calls.
export async function loadRankHistory(puuid: string, now: Date): Promise<RankPoint[]> {
  const start = new Date(now.getTime() - GRAPH_DAYS * 24 * 60 * 60 * 1000);
  const rows = await readCache(async (db) => {
    const columns = {
      queueType: true,
      tier: true,
      rank: true,
      leaguePoints: true,
      wins: true,
      losses: true,
      recordedAt: true,
    } as const;
    const [recent, older] = await Promise.all([
      db.query.rankHistory.findMany({
        where: and(eq(tables.rankHistory.puuid, puuid), gte(tables.rankHistory.recordedAt, start)),
        columns,
      }),
      // At most one row per queue is needed from before the window, but a
      // few spare rows are cheaper than one query per queue.
      db.query.rankHistory.findMany({
        where: and(eq(tables.rankHistory.puuid, puuid), lt(tables.rankHistory.recordedAt, start)),
        columns,
        orderBy: desc(tables.rankHistory.recordedAt),
        limit: 4,
      }),
    ]);
    return [...older, ...recent];
  });
  return rows ?? [];
}
