// Trains the game score (src/lib/analyzer/score.ts) on every saved game and
// writes the result to src/lib/analyzer/score-model.json.
//
//   npm run train-score
//
// Needs DATABASE_URL in .env.local. Makes no Riot calls. It learns from two
// tables: matches (games someone opened on the site) and score_games (games
// `npm run benchmarks` collected from every rank). So run the benchmarks
// first for more training data, then this, then commit the new
// score-model.json. It prints how accurate the model is and what it
// learned, so you can compare before committing.

import { writeFileSync } from "node:fs";
import { loadEnvConfig } from "@next/env";
import { asc, gt } from "drizzle-orm";
import { getDb, tables, type Db } from "@/db";
import { plural } from "@/lib/analyzer/format";
import {
  ROLES,
  SCORE_FEATURES,
  scoreExamples,
  toScoreGame,
  trainScoreModel,
  type ScoreGame,
} from "@/lib/analyzer/score";
import { positionName } from "@/lib/match-summary";
import type { Match } from "@/lib/riot/types";

// Read .env.local the same way `next dev` does.
loadEnvConfig(process.cwd());

const OUTPUT = "src/lib/analyzer/score-model.json";
// A saved match is the whole Riot payload (tens of KB), so read them a page
// at a time and keep only the numbers training needs.
const PAGE_SIZE = 200;

async function main() {
  const db = getDb();
  // Keyed by match ID, since a game can be in both tables.
  const found = new Map<string, ScoreGame>();
  try {
    await readMatches(db, found);
    const saved = await db.select({ game: tables.scoreGames.game }).from(tables.scoreGames);
    for (const row of saved) {
      const game = row.game as ScoreGame;
      found.set(game.matchId, game);
    }
  } finally {
    await db.$client.end();
  }

  const scorable = [...found.values()].map(scoreExamples).filter((e) => e.length > 0);
  const examples = scorable.flat();
  const games = scorable.length;
  if (games === 0) {
    throw new Error("No games to train on. Open some matches or run `npm run benchmarks` first.");
  }

  const model = trainScoreModel(examples, games, new Date());
  writeFileSync(OUTPUT, JSON.stringify(model, null, 2) + "\n");

  console.log(`Trained on ${plural(games, "game")} (${plural(examples.length, "player")}).`);
  console.log(
    `Shared weights pick the winner ${Math.round(model.shared.accuracy * 100)}% of the time in games they didn't see.`,
  );
  console.log("\nWhat they learned (bigger means it matters more; 0 means it didn't help):");
  for (const [i, feature] of SCORE_FEATURES.entries()) {
    console.log(`  ${feature.key.padEnd(24)} ${model.shared.weights[i].toFixed(2)}`);
  }
  console.log("\nRoles:");
  for (const role of ROLES) {
    const { samples, own } = model.roles[role];
    const weights = own
      ? `own weights, ${Math.round(own.accuracy * 100)}% accurate`
      : "shared weights (not enough games for its own yet)";
    console.log(`  ${positionName(role)}: ${plural(samples, "player")}, ${weights}`);
  }
  console.log(`\nSaved ${OUTPUT}. Commit it to update the score on the site.`);
}

async function readMatches(db: Db, found: Map<string, ScoreGame>) {
  const t = tables.matches;
  let after = "";
  for (;;) {
    const rows = await db
      .select({ matchId: t.matchId, raw: t.raw })
      .from(t)
      .where(gt(t.matchId, after))
      .orderBy(asc(t.matchId))
      .limit(PAGE_SIZE);
    if (rows.length === 0) return;
    for (const row of rows) found.set(row.matchId, toScoreGame(row.raw as Match));
    after = rows[rows.length - 1].matchId;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
