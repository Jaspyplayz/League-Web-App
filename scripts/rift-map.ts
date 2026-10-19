// Learns Summoner's Rift's walls from where champions stood (rift.ts), in
// the games `npm run tempo-games` saved for the tempo study and the item
// check, and saves them in src/lib/analyzer/rift-map.json (docs/replay.md).
//
//   npm run rift-map
//
// The counts are kept in .cache/rift-counts.json too. On a computer without
// the games, it rebuilds the walls from those counts instead, so the rules
// in rift.ts can be changed without downloading the games again.
//
// Makes no Riot calls and doesn't touch the database.

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ITEM_CHECK_FOLDER, type ItemCheckGame } from "@/lib/analyzer/item-check";
import {
  countPositions,
  decodeCounts,
  encodeCounts,
  encodeWalls,
  RIFT_CELL,
  RIFT_CELLS,
  wallOutline,
  wallsFromCounts,
} from "@/lib/analyzer/rift";
import { STUDY_FOLDER, type StudyGame } from "@/lib/analyzer/tempo-study";
import { trimTimeline, type TrimmedTimeline } from "@/lib/analyzer/trim";

const COUNTS_FILE = ".cache/rift-counts.json";
const MAP_FILE = "src/lib/analyzer/rift-map.json";
// With fewer games, quiet parts of the jungle have too few positions to
// tell from walls. The saved map was learned from about 2,000.
const MIN_GAMES = 1000;

type Counted = {
  cell: number;
  cells: number;
  games: number;
  positions: number;
  patches: Record<string, number>; // games per patch
  rows: string[]; // encodeCounts
};

function main() {
  const counted = countSavedGames() ?? savedCounts();
  if (counted.games < MIN_GAMES) {
    throw new Error(
      `Only ${counted.games} games, and the walls need at least ${MIN_GAMES}. Run: npm run tempo-games`,
    );
  }
  if (counted.cell !== RIFT_CELL || counted.cells !== RIFT_CELLS) {
    throw new Error(`${COUNTS_FILE} uses another grid size. Run this where the games are saved.`);
  }
  writeFileSync(COUNTS_FILE, JSON.stringify(counted));

  const walls = wallsFromCounts(decodeCounts(counted.rows));
  const open = walls.reduce((sum, cell) => sum + cell, 0);
  writeFileSync(
    MAP_FILE,
    `${JSON.stringify(
      {
        games: counted.games,
        positions: counted.positions,
        patches: counted.patches,
        // The walls traced for drawing (wallOutline), then the grid itself,
        // red side at the top: # is a wall.
        outline: wallOutline(walls),
        rows: encodeWalls(walls),
      },
      null,
      2,
    )}\n`,
  );
  console.log(
    `${counted.positions} positions in ${counted.games} games: ${open} of ${walls.length} cells open. Saved ${MAP_FILE}.`,
  );
}

// Where champions stood in every saved game, or null with none saved here.
function countSavedGames(): Counted | null {
  const timelines = new Map<string, TrimmedTimeline>();
  const patches = new Map<string, number>();
  const read = (folder: string) =>
    existsSync(folder)
      ? readdirSync(folder)
          .filter((name) => name.endsWith(".json"))
          .map((name) => JSON.parse(readFileSync(join(folder, name), "utf8")))
      : [];
  for (const game of read(STUDY_FOLDER) as StudyGame[]) {
    timelines.set(game.matchId, game.timeline);
    patches.set(game.patch, (patches.get(game.patch) ?? 0) + 1);
  }
  // The item check's games keep Riot's whole timeline. Some are also in the
  // tempo study's folder, so each game counts once.
  for (const game of read(ITEM_CHECK_FOLDER) as ItemCheckGame[]) {
    const matchId = game.match.metadata.matchId;
    if (!timelines.has(matchId)) timelines.set(matchId, trimTimeline(game.timeline));
  }
  if (timelines.size === 0) return null;

  const counts = countPositions([...timelines.values()]);
  return {
    cell: RIFT_CELL,
    cells: RIFT_CELLS,
    games: timelines.size,
    positions: counts.reduce((sum, n) => sum + n, 0),
    patches: Object.fromEntries(patches),
    rows: encodeCounts(counts),
  };
}

function savedCounts(): Counted {
  if (!existsSync(COUNTS_FILE)) {
    throw new Error(
      `No games in ${STUDY_FOLDER} or ${ITEM_CHECK_FOLDER}, and no ${COUNTS_FILE}. Run: npm run tempo-games`,
    );
  }
  console.log(`No saved games here, so the walls come from ${COUNTS_FILE}.`);
  return JSON.parse(readFileSync(COUNTS_FILE, "utf8")) as Counted;
}

main();
