// Moves the games and rows saved under the old Riot app's PUUIDs to the new
// app's (issue #154). Riot encrypts PUUIDs separately for each app, so since
// the site moved to Jasper's personal key every player has a new PUUID, and
// profiles drop the games saved before the move.
//
//   npm run remap-puuids                         dry run: download each old game again, write the map
//   npm run remap-puuids -- --apply <map file>   back up, then move every row to the new PUUIDs
//   npm run remap-puuids -- --rollback <backup>  put back exactly the rows the apply changed
//
// Needs RIOT_API_KEY, which has to be the key the live site uses (the dry run
// checks), and DATABASE_URL. Its files go to the git-ignored
// .cache/puuid-remap/ and hold PUUIDs, so they never go in a commit. The dry
// run makes one Riot call per old game, at most 50 every 2 minutes on each
// Riot region, which leaves the live site half the key's allowance: about 30
// minutes for 1,300 games.

import { join } from "node:path";
import { loadEnvConfig } from "@next/env";
import { getDb, type Db } from "@/db";
import { createPacer } from "@/lib/pace";
import { REGIONS } from "@/lib/regions";
import { getMatch } from "@/lib/riot/api";
import { RiotApiError } from "@/lib/riot/client";
import {
  apply,
  ApplyCheckError,
  cleanUp,
  dryRun,
  KeyCheckError,
  readMapFile,
  rollback,
  type Counts,
  type FetchMatch,
} from "./remap-puuids-db";
import { mb, parseMode, spaceNeeded, spaceProblem, type MapFile, type Mode } from "./remap-puuids-map";

// Read .env.local the same way `next dev` does.
loadEnvConfig(process.cwd());

const CALLS_PER_WINDOW = 50;
const WINDOW_MS = 2 * 60 * 1000;
const SECOND_CLEANUP_MS = 5 * 60 * 1000;
const UNAVAILABLE_RETRIES = 2;
const UNAVAILABLE_WAIT_MS = 15_000;
const DIR = join(process.cwd(), ".cache", "puuid-remap");

const USAGE = "Usage: npm run remap-puuids [-- --apply <map file> | -- --rollback <backup file>]";

async function main() {
  let mode: Mode;
  try {
    mode = parseMode(process.argv.slice(2));
  } catch (error) {
    console.error(`${error instanceof Error ? error.message : error}\n${USAGE}`);
    process.exitCode = 1;
    return;
  }

  const db = getDb();
  const log = (line: string) => console.log(line);
  try {
    switch (mode.kind) {
      case "dry-run": {
        const { path, file, counts } = await dryRun({ db, fetchMatch: pacedGetMatch(), dir: DIR, log });
        printDryRun(path, file, counts);
        break;
      }
      case "apply": {
        const file = readMapFile(mode.mapFile);
        const result = await apply({ db, dir: DIR, log }, file, mode.mapFile);
        if (result.kind === "already-applied") {
          console.log("This map is already applied, so only the cleanups run.");
        } else {
          console.log("\nApplied. Rows backed up, and rows created under new PUUIDs:");
          for (const [table, rows] of Object.entries(result.backedUp)) {
            console.log(`  ${table.padEnd(20)} ${count(rows).padStart(7)} backed up, ${count(result.created[table] ?? 0)} created`);
          }
          console.log(`To undo: npm run remap-puuids -- --rollback "${result.backupFile}"`);
        }
        await cleanUpTwice(db, file);
        break;
      }
      case "rollback": {
        const { restored, deleted, kept } = await rollback({ db }, mode.backupFile);
        console.log("Rolled back. Rows restored, and rows the apply created that were deleted:");
        for (const [table, rows] of Object.entries(restored)) {
          console.log(`  ${table.padEnd(20)} ${count(rows).padStart(7)} restored, ${count(deleted[table] ?? 0)} deleted`);
        }
        for (const [table, rows] of Object.entries(kept)) {
          console.log(`Kept ${count(rows)} ${table} rows the apply created, because the site has saved rows under them since.`);
        }
        break;
      }
    }
  } finally {
    await db.$client.end();
  }
}

// Step 2.9 on issue #154.
async function cleanUpTwice(db: Db, file: MapFile) {
  for (const [i, wait] of [0, SECOND_CLEANUP_MS].entries()) {
    if (wait > 0) {
      console.log(`Waiting ${wait / 60_000} minutes for the second cleanup...`);
      await sleep(wait);
    }
    const { participantsDeleted, gamesHolding } = await cleanUp(db, file.map);
    console.log(`Cleanup ${i + 1}: deleted ${count(participantsDeleted)} old match_participants rows saved again by the site.`);
    if (gamesHolding.length > 0) {
      console.error(`${gamesHolding.length} games have an old PUUID in their JSON again, such as ${gamesHolding[0]}.`);
      process.exitCode = 1;
    }
  }
}

// One pacer per Riot region, so each keeps under its own limit, and a wait
// and retry when Riot says to slow down anyway, since the live site uses the
// same key. riotGet already retries a failed request within a second; a game
// that still fails would go on the skip list, and clearing that takes another
// 30-minute dry run, so it's tried again after a longer wait.
function pacedGetMatch(): FetchMatch {
  const pacers = new Map<string, () => Promise<void>>();
  return async (region, matchId) => {
    const host = REGIONS[region].regional;
    const wait = pacers.get(host) ?? createPacer(CALLS_PER_WINDOW, WINDOW_MS);
    pacers.set(host, wait);
    for (let failures = 0; ; ) {
      await wait();
      try {
        return await getMatch(region, matchId);
      } catch (error) {
        if (error instanceof RiotApiError && error.kind === "rate-limited") {
          const seconds = error.retryAfter ?? 10;
          console.log(`[${host}] Rate limited, waiting ${seconds}s`);
          await sleep(seconds * 1000);
          continue;
        }
        if (error instanceof RiotApiError && error.kind === "unavailable" && failures < UNAVAILABLE_RETRIES) {
          failures++;
          console.log(`[${host}] ${matchId}: ${error.message}. Trying again in ${UNAVAILABLE_WAIT_MS / 1000}s`);
          await sleep(UNAVAILABLE_WAIT_MS);
          continue;
        }
        throw error;
      }
    }
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// The plan's dry-run table on issue #154, read on production on 2026-10-24
// around 20:30 UTC.
function printDryRun(path: string, file: MapFile, counts: Counts) {
  const hosts = Object.entries(counts.oldMatchesByHost)
    .map(([host, games]) => `${host} ${count(games)}`)
    .join(", ");
  const rows: [string, string, string][] = [
    ["Saved games, old key", "1,298 of 1,308", `${count(counts.oldMatches)} of ${count(counts.matches)}`],
    ["  by Riot region", "americas 754, asia 544", hosts],
    ["  not 10 players", "140", count(counts.notTenPlayers)],
    ["PUUID slots in them", "14,065", count(counts.slots)],
    ["Distinct old PUUIDs", "8,222", count(counts.distinctOldPuuids)],
    ["match_participants rows", "14,066", count(counts.participantRows)],
    ["players old / new", "11 / 5", `${count(counts.playersOld)} / ${count(counts.playersNew)}`],
    ["ranked_entries old", "13", count(counts.rankedOld)],
    ["rank_history old", "12", count(counts.rankHistoryOld)],
    ["player_seasons old", "4", count(counts.seasonsOld)],
    ["season_games old", "(new table)", count(counts.seasonGamesOld)],
    ["user_players old", "0", count(counts.userPlayersOld)],
    ["match_recaps old", "2", count(counts.recapsOld)],
    ["match_insights old", "0", count(counts.insightsOld)],
    ["ask_questions old", "0", count(counts.askOld)],
    ["benchmark_games old", "23,579", count(counts.benchmarkOld)],
  ];
  console.log(`\n${"".padEnd(26)}${"Plan".padEnd(25)}Now`);
  for (const [what, plan, now] of rows) console.log(`${what.padEnd(26)}${plan.padEnd(25)}${now}`);

  console.log(
    `\nThe database is ${mb(counts.databaseBytes)}; the free tier holds 500 MB. The apply needs about ` +
      `${mb(spaceNeeded(counts))} more, and most of it stays used afterwards, since Postgres keeps the old copies' space for new rows.`,
  );
  const space = spaceProblem(counts);
  if (space) console.log(`STOP: ${space}`);

  console.log(`\nMapped ${count(file.map.size)} old PUUIDs to new ones.`);
  const unmapped = file.oldPlayers.filter((puuid) => !file.map.has(puuid)).length;
  console.log(
    unmapped === 0
      ? `All ${count(file.oldPlayers.length)} old players rows are in the map.`
      : `${unmapped} of ${count(file.oldPlayers.length)} old players rows aren't in the map, so they and their rank history keep their old PUUID.`,
  );
  if (file.skips.length === 0) {
    console.log("Nothing skipped.");
  } else {
    console.log(`Skipped ${count(file.skips.length)}:`);
    for (const skip of file.skips.slice(0, 20)) {
      const what = skip.kind === "conflict" ? skip.matchIds.join(", ") : skip.matchId;
      console.log(`  ${skip.kind} ${what}: ${skip.reason}`);
    }
    if (file.skips.length > 20) console.log(`  ...and ${count(file.skips.length - 20)} more in the map file.`);
  }
  console.log(`\nWrote ${path}\nNext, after reading the above: npm run remap-puuids -- --apply "${path}"`);
}

function count(n: number): string {
  return n.toLocaleString("en-US");
}

main().catch((error: unknown) => {
  if (error instanceof KeyCheckError) {
    console.error(`${error.message}\nNothing was written.`);
  } else if (error instanceof ApplyCheckError) {
    console.error(error.message);
  } else if (error instanceof RiotApiError && error.kind === "bad-key") {
    console.error(`${error.message}. Use the key the live site uses.`);
  } else if (error instanceof RiotApiError) {
    console.error(`Riot API error: ${error.message}`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
