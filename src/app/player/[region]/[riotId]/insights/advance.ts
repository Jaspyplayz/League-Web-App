"use server";

import { fillCounts, type AdvanceResult } from "@/lib/insight-fill";
import { GAME_WINDOWS } from "@/lib/insights-filters";
import { isRegion } from "@/lib/regions";
import { getAccount } from "@/lib/riot/api";
import { settle, type RiotApiError } from "@/lib/riot/client";
import { fromSlug } from "@/lib/riot-id";
import { loadTrendGames } from "@/lib/trend-games";
import { loadChosenPlayer, readChoice } from "./chosen-player";

// One Insights batch. The page itself only reads the cache, so this is the
// call that asks Riot for the next matches and timelines. The write finishes
// before the result goes back, so the refresh that follows can see the rows.
// Anyone can call a server action, so the region, the slug and the window
// are checked here the same way the page checks them.

const TIMELINES_PER_BATCH = 5;

export type AdvanceInput = {
  region: string;
  riotId: string;
  games: number;
  vs: string | null;
  vsRegion: string | null;
};

function pauseFor(error: RiotApiError): AdvanceResult {
  return {
    status: "pause",
    retryAfterS: error.kind === "rate-limited" ? (error.retryAfter ?? null) : null,
  };
}

function retryAfter(error: RiotApiError | null): number | null {
  return error?.kind === "rate-limited" ? (error.retryAfter ?? null) : null;
}

export async function advanceInsights(input: AdvanceInput): Promise<AdvanceResult> {
  if (!isRegion(input.region)) return { status: "pause", retryAfterS: null };
  const id = fromSlug(input.riotId);
  if (!id) return { status: "pause", retryAfterS: null };
  const games = GAME_WINDOWS.find((window) => window === input.games) ?? GAME_WINDOWS[0];

  const account = await settle(getAccount(input.region, id));
  if (!account.ok) return pauseFor(account.error);
  if (!account.value) return { status: "pause", retryAfterS: null };

  const loaded = await settle(
    loadTrendGames(input.region, account.value.puuid, {
      count: games,
      budget: TIMELINES_PER_BATCH,
      persist: "now",
    }),
  );
  if (!loaded.ok) return pauseFor(loaded.error);

  const choice = input.vs ? readChoice({ vs: input.vs, vsRegion: input.vsRegion ?? undefined }) : null;
  const chosen = choice
    ? await loadChosenPlayer(choice, { budget: TIMELINES_PER_BATCH, persist: "now" })
    : null;
  if (chosen?.status === "error" && chosen.error.kind === "rate-limited") return pauseFor(chosen.error);

  const theirs = chosen?.status === "ok" ? chosen : null;
  return {
    status: "ready",
    counts: fillCounts([
      {
        analyzed: loaded.value.games.length,
        waiting: loaded.value.waiting,
        retryAfterS: retryAfter(loaded.value.error),
      },
      ...(theirs
        ? [
            {
              analyzed: theirs.games.length,
              waiting: theirs.waiting,
              retryAfterS: retryAfter(theirs.error),
            },
          ]
        : []),
    ]),
  };
}
