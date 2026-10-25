// Checks the saved game score (src/lib/analyzer/score-model.json) on games
// it could not have trained on, and saves the result in that file.
//
//   npm run check-score
//
// Needs DATABASE_URL in .env.local. Makes no Riot calls and only reads the
// database. The games are the score_games rows collected after the model's
// trainedAt, minus any game the site had saved in matches by then, since
// `npm run train-score` learns from both tables. How it works shows the
// result once the new score-model.json is committed. A retrain drops it, so
// run this again once `npm run benchmarks` has collected games since.

import { readFileSync, writeFileSync } from "node:fs";
import { loadEnvConfig } from "@next/env";
import { gt, lte } from "drizzle-orm";
import { getDb, tables } from "@/db";
import { plural } from "@/lib/analyzer/format";
import { checkScoreModel, type ScoreGame, type ScoreModel } from "@/lib/analyzer/score";

// Read .env.local the same way `next dev` does.
loadEnvConfig(process.cwd());

const MODEL = "src/lib/analyzer/score-model.json";

async function main() {
  const model = JSON.parse(readFileSync(MODEL, "utf8")) as ScoreModel;
  const trainedAt = new Date(model.trainedAt);

  const db = getDb();
  let collected: ScoreGame[];
  let trainedOn: Set<string>;
  try {
    const s = tables.scoreGames;
    const rows = await db.select({ game: s.game }).from(s).where(gt(s.collectedAt, trainedAt));
    collected = rows.map((row) => row.game as ScoreGame);
    const m = tables.matches;
    const site = await db.select({ matchId: m.matchId }).from(m).where(lte(m.fetchedAt, trainedAt));
    trainedOn = new Set(site.map((row) => row.matchId));
  } finally {
    await db.$client.end();
  }

  const unseen = collected.filter((game) => !trainedOn.has(game.matchId));
  const check = checkScoreModel(model, unseen, new Date());
  console.log(`Model trained ${model.trainedAt} on ${plural(model.games, "game")}.`);
  console.log(`Read ${plural(collected.length, "game")} collected after that.`);
  console.log(`Left out ${collected.length - unseen.length} the site had saved by then.`);
  console.log(
    `Scored ${plural(check.games, "game")}; ${unseen.length - check.games} couldn't be scored (short, remade or without roles).`,
  );
  if (check.games === 0) {
    throw new Error("No games to check. Run `npm run benchmarks` to collect some first.");
  }

  writeFileSync(MODEL, JSON.stringify({ ...model, unseen: check }, null, 2) + "\n");
  console.log(
    `\nThe saved weights pick the winning side ${(check.accuracy * 100).toFixed(1)}% of the time in these games, where a coin flip gets 50%.`,
  );
  console.log(`Saved the check in ${MODEL}. Commit it to show it on How it works.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
