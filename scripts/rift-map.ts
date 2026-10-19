// Learns Summoner's Rift's walls from where champions stood (rift.ts), in
// the games `npm run tempo-games` saved for the tempo study and the item
// check (docs/replay.md).
//
//   npm run rift-map -- --counts    saves how many positions fell in each cell
//                                   to .cache/rift-counts.json
//
// Makes no Riot calls and doesn't touch the database.

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { ITEM_CHECK_FOLDER, type ItemCheckGame } from "@/lib/analyzer/item-check";
import { countPositions, encodeCounts, RIFT_CELL, RIFT_CELLS } from "@/lib/analyzer/rift";
import { STUDY_FOLDER, type StudyGame } from "@/lib/analyzer/tempo-study";
import { trimTimeline, type TrimmedTimeline } from "@/lib/analyzer/trim";

const { values: args } = parseArgs({ options: { counts: { type: "boolean", default: false } } });

function main() {
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
  if (timelines.size === 0) {
    throw new Error(`No games in ${STUDY_FOLDER} or ${ITEM_CHECK_FOLDER}. Run: npm run tempo-games`);
  }

  const counts = countPositions([...timelines.values()]);
  const positions = counts.reduce((sum, n) => sum + n, 0);
  if (args.counts) {
    const out = ".cache/rift-counts.json";
    writeFileSync(
      out,
      JSON.stringify({
        cell: RIFT_CELL,
        cells: RIFT_CELLS,
        games: timelines.size,
        positions,
        patches: Object.fromEntries(patches),
        rows: encodeCounts(counts),
      }),
    );
    console.log(`Counted ${positions} positions in ${timelines.size} games into ${out}.`);
  }
}

main();
