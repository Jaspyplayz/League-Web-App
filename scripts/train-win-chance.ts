// Trains the win chance model (src/lib/analyzer/win-chance.ts) on every saved
// game and writes the result to src/lib/analyzer/win-chance-model.json.
//
//   npm run train-win-chance                     every saved game
//   npm run train-win-chance -- --patches 3      only the 3 newest patches
//
// Needs DATABASE_URL in .env.local. Makes no Riot calls. It learns from
// win_chance_games (filled by `npm run benchmarks`) and from the games opened
// on the site (matches and match_timelines). It prints how accurate the model
// is and what it learned, so you can compare before committing the new
// win-chance-model.json. Besides the all-ranks model, it trains one for
// each rank with enough games (WIN_CHANCE_RANKS), which needs the games'
// tiers: benchmark games know theirs, games opened on the site don't.

import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { loadEnvConfig } from "@next/env";
import { asc, eq, gt } from "drizzle-orm";
import { getDb, tables, type Db } from "@/db";
import { plural } from "@/lib/analyzer/format";
import type { TrimmedTimeline } from "@/lib/analyzer/trim";
import {
  comparePatches,
  MIN_RANK_GAMES,
  toWinChanceGame,
  trainWinChanceModel,
  WIN_CHANCE_FEATURES,
  WIN_CHANCE_RANKS,
  whatIfChance,
  winChanceExamples,
  withRank,
  type Evaluation,
  type WinChanceGame,
  type WinChanceModel,
} from "@/lib/analyzer/win-chance";
import type { Match } from "@/lib/riot/types";

// Read .env.local the same way `next dev` does.
loadEnvConfig(process.cwd());

const OUTPUT = "src/lib/analyzer/win-chance-model.json";
// A saved match plus its timeline is tens of KB, so read them a page at a
// time and keep only the numbers training needs.
const PAGE_SIZE = 100;

const { values: args } = parseArgs({
  options: { patches: { type: "string" } },
});

async function main() {
  const db = getDb();
  // Keyed by match ID, since a game can be in both places.
  const found = new Map<string, WinChanceGame>();
  try {
    await readSiteGames(db, found);
    await readBenchmarkGames(db, found);
    await addMissingTiers(db, found);
  } finally {
    await db.$client.end();
  }

  let games = [...found.values()];
  const patches = [...new Set(games.map((g) => g.patch))].sort(comparePatches);
  console.log(`Found ${plural(games.length, "game")} on ${patchCount(patches.length)}:`);
  for (const patch of patches) {
    console.log(`  ${patch}: ${plural(games.filter((g) => g.patch === patch).length, "game")}`);
  }
  if (args.patches) {
    const keep = Number(args.patches);
    if (!Number.isInteger(keep) || keep < 1) throw new Error("--patches must be a whole number above 0");
    const recent = new Set(patches.slice(-keep));
    games = games.filter((g) => recent.has(g.patch));
    console.log(`Training on the newest ${patchCount(recent.size)} only.`);
  }

  const examples = games.flatMap(winChanceExamples);
  if (examples.length === 0) {
    throw new Error("No games to train on. Open some matches or run `npm run benchmarks` first.");
  }

  const model = trainWinChanceModel(examples, games.length, new Date());
  writeFileSync(OUTPUT, JSON.stringify(model, null, 2) + "\n");

  console.log(`\nTrained on ${plural(games.length, "game")} (${plural(examples.length, "minute")}).`);
  printEvaluation("Games it didn't see", model.evaluation);
  if (model.newestPatch) {
    const { patch, games: count } = model.newestPatch;
    printEvaluation(`Just patch ${patch} (${plural(count, "game")})`, model.newestPatch);
  }

  console.log("\nWhat it learned (each lead adds this much to blue's score; 0 means it didn't help):");
  for (const [i, feature] of WIN_CHANCE_FEATURES.entries()) {
    console.log(`  ${feature.key.padEnd(12)} ${model.weights[i].toFixed(3).padStart(8)}   ${feature.label}`);
  }
  printRanks(model, games);
  console.log(`\nSaved ${OUTPUT}. Commit it to update the win chance on the site.`);
}

// Each rank's model next to the all-ranks model on the same games, and what
// one lead is worth at each rank, so differences between ranks are easy to see.
function printRanks(model: WinChanceModel, games: WinChanceGame[]) {
  const percent = (x: number) => `${Math.round(x * 100)}%`;
  const at20 = (e: Evaluation) => e.byMinute.find((m) => m.minute === 20)?.accuracy ?? 0;
  // 3,000 gold and 2,000 XP ahead at 20:00, nothing else.
  const lead = { minute: 20, goldLead: 3000, xpLead: 2000, dragonLead: 0, inhibitorLead: 0, baron: 0 } as const;

  const ranked = games.filter((g) => g.tier).length;
  console.log(`\n${plural(ranked, "game")} of ${games.length} have a rank (games opened on the site don't).`);
  console.log("By rank (own model vs the all-ranks model, on games it didn't see):");
  console.log("  rank          games   log loss       at 20:00     3k gold up at 20:00");
  for (const rank of WIN_CHANCE_RANKS) {
    const trained = model.ranks.find((r) => r.key === rank.key);
    if (!trained) {
      const count = games.filter((g) => g.tier && (rank.tiers as readonly string[]).includes(g.tier)).length;
      console.log(`  ${rank.label.padEnd(12)} ${String(count).padStart(6)}   too few games (needs ${MIN_RANK_GAMES}), uses a bigger group`);
      continue;
    }
    const { evaluation: own, allRanks: all } = trained;
    console.log(
      `  ${rank.label.padEnd(12)} ${String(trained.games).padStart(6)}   ` +
        `${own.logLoss.toFixed(3)} vs ${all.logLoss.toFixed(3)}   ` +
        `${percent(at20(own)).padStart(4)} vs ${percent(at20(all)).padStart(4)}   ` +
        `${percent(whatIfChance(withRank(model, trained), lead)).padStart(4)} ` +
        `(all ranks ${percent(whatIfChance(model, lead))})`,
    );
  }
  console.log("  (lower log loss is better)");
}

function printEvaluation(title: string, e: Evaluation) {
  const percent = (x: number) => `${Math.round(x * 100)}%`;
  console.log(`\n${title}:`);
  console.log(`  Picks the winner ${percent(e.accuracy)} of the time over ${plural(e.examples, "minute")}`);
  console.log(`  Log loss ${e.logLoss} (a coin flip is 0.693), Brier score ${e.brier} (a coin flip is 0.25)`);
  console.log("  By minute (model vs \"more gold wins\"):");
  for (const m of e.byMinute) {
    if (m.examples === 0) continue;
    console.log(
      `    ${String(m.minute).padStart(2)}:00  ${percent(m.accuracy).padStart(4)} vs ${percent(m.goldRule).padStart(4)}` +
        `  (${plural(m.examples, "game")})`,
    );
  }
  console.log("  Calibration (when it says this, blue really wins this often):");
  for (const c of e.calibration) {
    if (c.examples === 0) continue;
    console.log(
      `    ${percent(c.from).padStart(4)}-${percent(c.to).padEnd(4)}  said ${percent(c.predicted).padStart(4)}, ` +
        `won ${percent(c.actual).padStart(4)}  (${plural(c.examples, "minute")})`,
    );
  }
}

const patchCount = (n: number) => `${n} patch${n === 1 ? "" : "es"}`;

// Games someone opened on the site: their saved match and timeline.
async function readSiteGames(db: Db, found: Map<string, WinChanceGame>) {
  const m = tables.matches;
  const t = tables.matchTimelines;
  let after = "";
  for (;;) {
    const rows = await db
      .select({ matchId: m.matchId, raw: m.raw, frames: t.frames, events: t.events })
      .from(m)
      .innerJoin(t, eq(t.matchId, m.matchId))
      .where(gt(m.matchId, after))
      .orderBy(asc(m.matchId))
      .limit(PAGE_SIZE);
    if (rows.length === 0) return;
    for (const row of rows) {
      const timeline = { frames: row.frames, events: row.events } as TrimmedTimeline;
      const game = toWinChanceGame(row.raw as Match, timeline);
      if (game) found.set(game.matchId, game);
    }
    after = rows[rows.length - 1].matchId;
  }
}

async function readBenchmarkGames(db: Db, found: Map<string, WinChanceGame>) {
  const t = tables.winChanceGames;
  let after = "";
  for (;;) {
    const rows = await db
      .select({ matchId: t.matchId, game: t.game })
      .from(t)
      .where(gt(t.matchId, after))
      .orderBy(asc(t.matchId))
      .limit(PAGE_SIZE * 10);
    if (rows.length === 0) return;
    for (const row of rows) found.set(row.matchId, row.game as WinChanceGame);
    after = rows[rows.length - 1].matchId;
  }
}

// Games saved before win_chance_games recorded tiers get theirs from
// benchmark_games, which keeps the tier of the player each game was
// collected from.
async function addMissingTiers(db: Db, found: Map<string, WinChanceGame>) {
  const t = tables.benchmarkGames;
  const rows = await db.selectDistinctOn([t.matchId], { matchId: t.matchId, tier: t.tier }).from(t);
  for (const { matchId, tier } of rows) {
    const game = found.get(matchId);
    if (game && !game.tier) game.tier = tier;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
