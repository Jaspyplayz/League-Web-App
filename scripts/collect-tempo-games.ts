// Downloads games for the tempo study (docs/tempo.md) into a local folder,
// .cache/tempo-study/, which git ignores. Nothing is saved to the database.
//
//   npm run tempo-games                                     Oceania, every tier
//   npm run tempo-games -- --tiers master,grandmaster,challenger --players 40
//   npm run tempo-games -- --region na --tiers gold --players 2 --games 3   a quick test
//   npm run tempo-games -- --items --players 3 --games 5    games for the item check
//
// Needs RIOT_API_KEY in .env.local. Then `npm run study-tempo` reads the
// folder and prints the report. With --items it saves each game's whole
// timeline and final items into .cache/item-check instead, for
// `npm run check-items` (docs/replay.md).
//
// Like the benchmark collector, it picks players spread across each tier's
// ladder and downloads their recent ranked games, staying under 70 calls every
// 2 minutes. It defaults to the Oceania server because Riot counts each
// server group's limit separately, and the benchmark collector uses NA, EUW
// and KR, so the two can run at the same time without slowing each other or
// the live site down. Every game has two junglers, so any game will do,
// whatever role the sampled player plays. Stopping it loses nothing: games
// already in the folder are skipped next time.

import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { loadEnvConfig } from "@next/env";
import { samplePlayers } from "@/lib/analyzer/benchmarks";
import { plural } from "@/lib/analyzer/format";
import { ITEM_CHECK_FOLDER, toItemCheckGame } from "@/lib/analyzer/item-check";
import { STUDY_FOLDER, toStudyGame } from "@/lib/analyzer/tempo-study";
import { createPacer } from "@/lib/pace";
import { isRegion, type Region } from "@/lib/regions";
import {
  getApexLeague,
  getLeagueEntries,
  getMatch,
  getMatchIds,
  getTimeline,
  RANKED_SOLO_QUEUE,
} from "@/lib/riot/api";
import { RiotApiError } from "@/lib/riot/client";
import { DIVISIONS, isApexTier, isTier, tierName, TIERS, type Tier } from "@/lib/tiers";

// Read .env.local the same way `next dev` does.
loadEnvConfig(process.cwd());

const CALLS_PER_WINDOW = 70;
const WINDOW_MS = 2 * 60 * 1000;

const { values: args } = parseArgs({
  options: {
    region: { type: "string", default: "oce" },
    // Highest first, so the games that matter most arrive first.
    tiers: { type: "string", default: [...TIERS].reverse().join(",") },
    players: { type: "string", default: "20" },
    games: { type: "string", default: "10" },
    items: { type: "boolean", default: false },
  },
});

const FOLDER = args.items ? ITEM_CHECK_FOLDER : STUDY_FOLDER;

async function main() {
  const region = args.region;
  if (!isRegion(region)) throw new Error(`Unknown region: ${region}`);
  const tiers = args.tiers.toUpperCase().split(",");
  const badTiers = tiers.filter((t) => !isTier(t));
  if (badTiers.length > 0) throw new Error(`Unknown tier: ${badTiers.join(", ")}`);
  const playerCount = Number(args.players);
  const gameCount = Number(args.games);
  if (!Number.isInteger(playerCount) || playerCount < 1) throw new Error("--players must be a whole number above 0");
  if (!Number.isInteger(gameCount) || gameCount < 1 || gameCount > 100) {
    throw new Error("--games must be a whole number from 1 to 100");
  }

  mkdirSync(FOLDER, { recursive: true });
  // Match IDs already downloaded, or already checked and skipped this run.
  const seen = new Set(savedIds());
  console.log(`${plural(seen.size, "game")} already in ${FOLDER}`);

  const call = pacedCaller();
  for (const tier of tiers as Tier[]) {
    const players = await pickPlayers(call, region, tier, playerCount);
    let saved = 0;
    for (const puuid of players) {
      const ids = await call(() =>
        getMatchIds(region, puuid, gameCount, { queue: RANKED_SOLO_QUEUE }),
      );
      for (const matchId of ids) {
        if (seen.has(matchId)) continue;
        seen.add(matchId);
        try {
          const match = await call(() => getMatch(region, matchId));
          // Remakes and short games are skipped before downloading the timeline.
          if (match.info.queueId !== RANKED_SOLO_QUEUE || match.info.gameDuration < 15 * 60) continue;
          const timeline = await call(() => getTimeline(region, matchId));
          const game = args.items
            ? toItemCheckGame(match, timeline)
            : toStudyGame(match, timeline, tier, region);
          if (!game) continue;
          writeFileSync(join(FOLDER, `${matchId}.json`), JSON.stringify(game));
          saved++;
        } catch (error) {
          // One broken game shouldn't stop the run. A bad key stops everything.
          if (error instanceof RiotApiError && error.kind !== "bad-key") {
            console.log(`Skipped ${matchId}: ${error.message}`);
            continue;
          }
          throw error;
        }
      }
    }
    console.log(`${tierName(tier)}: saved ${plural(saved, "game")} from ${plural(players.length, "player")}`);
  }
  const next = args.items ? "npm run check-items" : "npm run study-tempo";
  console.log(`\n${FOLDER} now holds ${plural(savedIds().length, "game")}. Next: ${next}`);
}

function savedIds(): string[] {
  return readdirSync(FOLDER)
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.replace(/\.json$/, ""));
}

type Call = ReturnType<typeof pacedCaller>;

async function pickPlayers(call: Call, region: Region, tier: Tier, count: number): Promise<string[]> {
  if (isApexTier(tier)) {
    const league = await call(() => getApexLeague(region, tier));
    return samplePlayers(league.entries, count);
  }
  const perDivision = Math.ceil(count / DIVISIONS.length);
  const picked: string[] = [];
  for (const division of DIVISIONS) {
    const entries = await call(() => getLeagueEntries(region, tier, division));
    picked.push(...samplePlayers(entries, perDivision));
  }
  return picked.slice(0, count);
}

// Waits its turn under the rate limit before each call, and waits and tries
// again when Riot says to slow down anyway.
function pacedCaller() {
  const wait = createPacer(CALLS_PER_WINDOW, WINDOW_MS);
  return async function call<T>(fn: () => Promise<T>): Promise<T> {
    for (;;) {
      await wait();
      try {
        return await fn();
      } catch (error) {
        if (error instanceof RiotApiError && error.kind === "rate-limited") {
          const seconds = error.retryAfter ?? 10;
          console.log(`Rate limited, waiting ${seconds}s`);
          await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
          continue;
        }
        throw error;
      }
    }
  };
}

main().catch((error: unknown) => {
  if (error instanceof RiotApiError && error.kind === "bad-key") {
    console.error(
      "Riot rejected RIOT_API_KEY. Development keys expire every 24 hours: make a new one at https://developer.riotgames.com and put it in .env.local.",
    );
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
