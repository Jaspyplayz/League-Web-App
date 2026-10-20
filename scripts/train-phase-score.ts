// Trains the phase ratings (src/lib/analyzer/phase-score.ts) and writes the
// result to src/lib/analyzer/phase-score-model.json.
//
//   npm run train-phase-score
//   npm run train-phase-score -- --folder some/other/folder
//
// Makes no Riot calls. It learns from two places:
// - the games `npm run tempo-games` saved in .cache/tempo-study (or --folder),
//   which keep each game's whole timeline;
// - the games opened on the site (matches and match_timelines), when
//   DATABASE_URL is in .env.local. Without it, those are skipped.
// It prints how accurate each phase's model is and what it learned, so you
// can compare before committing the new phase-score-model.json.

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { loadEnvConfig } from "@next/env";
import { asc, eq, gt } from "drizzle-orm";
import { getDb, tables, type Db } from "@/db";
import { plural } from "@/lib/analyzer/format";
import {
  fromStudyGame,
  PHASE_FEATURES,
  PHASES,
  toPhaseGame,
  trainPhaseModel,
  type PhaseGame,
} from "@/lib/analyzer/phase-score";
import { ROLES } from "@/lib/analyzer/score";
import { STUDY_FOLDER, type StudyGame } from "@/lib/analyzer/tempo-study";
import type { TrimmedTimeline } from "@/lib/analyzer/trim";
import { positionName } from "@/lib/match-summary";
import type { Match } from "@/lib/riot/types";

// Read .env.local the same way `next dev` does.
loadEnvConfig(process.cwd());

const OUTPUT = "src/lib/analyzer/phase-score-model.json";
// A saved match plus its timeline is tens of KB, so read them a page at a time.
const PAGE_SIZE = 100;

const { values: args } = parseArgs({
  options: { folder: { type: "string", default: STUDY_FOLDER } },
});

async function main() {
  // Keyed by match ID, since a game can be in both places.
  const found = new Map<string, PhaseGame>();
  readFolder(args.folder, found);
  if (process.env.DATABASE_URL) {
    const db = getDb();
    try {
      await readSiteGames(db, found);
    } finally {
      await db.$client.end();
    }
  } else {
    console.log("No DATABASE_URL, so games opened on the site are skipped.");
  }

  const games = [...found.values()];
  if (games.length === 0) {
    throw new Error(
      `No games to train on. Run \`npm run tempo-games\` or open some matches first.`,
    );
  }

  const model = trainPhaseModel(games, new Date());
  writeFileSync(OUTPUT, JSON.stringify(model, null, 2) + "\n");

  console.log(`Trained on ${plural(games.length, "game")}.`);
  for (const phase of PHASES) {
    const m = model.phases[phase.key];
    if (!m) {
      console.log(`\n${phase.label}: no games lasted long enough.`);
      continue;
    }
    console.log(
      `\n${phase.label} (${plural(m.games, "game")}): shared weights pick the winner ` +
        `${Math.round(m.shared.accuracy * 100)}% of the time in games they didn't see.`,
    );
    console.log("  What they learned (bigger means it matters more; 0 means it didn't help):");
    for (const [i, feature] of PHASE_FEATURES.entries()) {
      console.log(`    ${feature.key.padEnd(20)} ${m.shared.weights[i].toFixed(2)}`);
    }
    for (const role of ROLES) {
      const { samples, own } = m.roles[role];
      const weights = own
        ? `own weights, ${Math.round(own.accuracy * 100)}% accurate`
        : "shared weights (not enough games for its own yet)";
      console.log(`  ${positionName(role)}: ${plural(samples, "player")}, ${weights}`);
    }
  }
  console.log(`\nSaved ${OUTPUT}. Commit it to update the phase ratings on the site.`);
}

function readFolder(folder: string, found: Map<string, PhaseGame>) {
  if (!existsSync(folder)) {
    console.log(`No ${folder} folder, so only games opened on the site are used.`);
    return;
  }
  const files = readdirSync(folder).filter((f) => f.endsWith(".json"));
  for (const file of files) {
    const study = JSON.parse(readFileSync(join(folder, file), "utf8")) as StudyGame;
    const game = fromStudyGame(study);
    if (game) found.set(game.matchId, game);
  }
  console.log(`Read ${plural(files.length, "game")} from ${folder}.`);
}

async function readSiteGames(db: Db, found: Map<string, PhaseGame>) {
  const m = tables.matches;
  const t = tables.matchTimelines;
  let after = "";
  let count = 0;
  for (;;) {
    const rows = await db
      .select({
        matchId: m.matchId,
        raw: m.raw,
        frames: t.frames,
        events: t.events,
      })
      .from(m)
      .innerJoin(t, eq(t.matchId, m.matchId))
      .where(gt(m.matchId, after))
      .orderBy(asc(m.matchId))
      .limit(PAGE_SIZE);
    if (rows.length === 0) break;
    for (const row of rows) {
      const timeline = {
        frames: row.frames,
        events: row.events,
      } as TrimmedTimeline;
      const game = toPhaseGame(row.raw as Match, timeline);
      if (game) {
        found.set(game.matchId, game);
        count++;
      }
    }
    after = rows[rows.length - 1].matchId;
  }
  console.log(`Read ${plural(count, "game")} opened on the site.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
