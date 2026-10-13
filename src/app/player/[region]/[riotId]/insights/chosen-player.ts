import "server-only";

import type { BenchmarkGame } from "@/lib/analyzer/compare";
import { isRegion, type Region } from "@/lib/regions";
import { getAccount, RANKED_SOLO_QUEUE } from "@/lib/riot/api";
import { settle, type RiotApiError } from "@/lib/riot/client";
import { parseRiotId, toSlug } from "@/lib/riot-id";
import { loadTrendGames } from "@/lib/trend-games";

// The player someone picked in "Compare with a player", such as a pro's solo
// queue account. The choice lives in the URL
// (?vs=Hide%20on%20bush%23KR1&vsRegion=kr), so a comparison can be shared.

export type Choice = { input: string; region: Region };

export type ChosenPlayer =
  | { status: "invalid"; choice: Choice }
  | { status: "not-found"; choice: Choice }
  | { status: "error"; choice: Choice; error: RiotApiError }
  | {
      status: "ok";
      choice: Choice;
      name: string;
      href: string; // their own Insights page
      games: BenchmarkGame[];
      waiting: number;
      error: RiotApiError | null;
    };

// Their last 20 ranked solo games, the same window the Challenger benchmarks use.
const GAME_COUNT = 20;
const TIMELINES_PER_VIEW = 5;

type SearchParams = Record<string, string | string[] | undefined>;

// Null when no one has been picked.
export function readChoice(searchParams: SearchParams): Choice | null {
  const input = typeof searchParams.vs === "string" ? searchParams.vs.trim() : "";
  if (!input) return null;
  const region = typeof searchParams.vsRegion === "string" ? searchParams.vsRegion : "";
  return { input, region: isRegion(region) ? region : "kr" };
}

export async function loadChosenPlayer(choice: Choice): Promise<ChosenPlayer> {
  const id = parseRiotId(choice.input);
  if (!id) return { status: "invalid", choice };

  const account = await settle(getAccount(choice.region, id));
  if (!account.ok) return { status: "error", choice, error: account.error };
  if (!account.value) return { status: "not-found", choice };
  const { puuid, gameName } = account.value;

  // Only ranked solo/duo, since that's the queue the comparison is about.
  const loaded = await settle(
    loadTrendGames(choice.region, puuid, {
      count: GAME_COUNT,
      budget: TIMELINES_PER_VIEW,
      queue: RANKED_SOLO_QUEUE,
    }),
  );
  if (!loaded.ok) return { status: "error", choice, error: loaded.error };

  return {
    status: "ok",
    choice,
    name: gameName,
    href: `/player/${choice.region}/${toSlug(account.value)}/insights`,
    // Benchmark games also say whose game they were.
    games: loaded.value.games.map((game) => ({ ...game, puuid })),
    waiting: loaded.value.waiting,
    error: loaded.value.error,
  };
}
