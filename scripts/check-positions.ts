// The position check (docs/replay.md): how close the replay's map gets to
// where each champion really was, on the games that
// `npm run tempo-games -- --items` saved in .cache/item-check. Leaves out
// each of Riot's once-a-minute snapshots in turn, estimates it from
// everything else, and prints how far off each way of building the path is,
// then checks the guesses the path is built on.
//
//   npm run check-positions
//
// Makes no Riot calls and doesn't touch the database.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { plural } from "@/lib/analyzer/format";
import { ITEM_CHECK_FOLDER, type ItemCheckGame } from "@/lib/analyzer/item-check";
import {
  checkPositions,
  POSITION_VARIANTS,
  type PositionCheck,
} from "@/lib/analyzer/position-check";
import { trimTimeline } from "@/lib/analyzer/trim";

function main() {
  const files = readdirSync(ITEM_CHECK_FOLDER).filter((name) => name.endsWith(".json"));
  if (files.length === 0) {
    throw new Error(`No games in ${ITEM_CHECK_FOLDER}. Run: npm run tempo-games -- --items`);
  }

  const checks: PositionCheck[] = files.map((file) => {
    const game = JSON.parse(readFileSync(join(ITEM_CHECK_FOLDER, file), "utf8")) as ItemCheckGame;
    return checkPositions(trimTimeline(game.timeline), game.match.info.participants);
  });
  const all = (pick: (c: PositionCheck) => number[]) => checks.flatMap(pick);

  const moments = all((c) => c.all[0]).length;
  const busy = all((c) => c.busy[0]).length;
  console.log(`# Position check\n`);
  console.log(
    `${plural(files.length, "game")}, ${plural(all((c) => c.pathPoints).length, "player")}, ${moments} snapshots left out one at a time, ${busy} of them with something happening in the two minutes around.\n`,
  );

  console.log(`## How far the estimate was from the snapshot left out\n`);
  console.log(`In map units: the map is about 14,900 across, a lane about 800 wide.\n`);
  table((c, v) => c.all[v]);
  console.log(
    `\n### Only moments where the player did something between the snapshots either side\n`,
  );
  table((c, v) => c.busy[v]);

  console.log(`\n### The replay's way, by role\n`);
  console.log(
    `| Role | Moments | Median | 75% within | 90% within | Within 1,000 | Within 2,000 |`,
  );
  console.log(`|---|---|---|---|---|---|---|`);
  const roles = [...new Set(checks.flatMap((c) => Object.keys(c.byRole)))];
  for (const role of roles) {
    const misses = checks.flatMap((c) => c.byRole[role] ?? []).sort((a, b) => a - b);
    console.log(`| ${role} | ${misses.length} | ${spread(misses)} |`);
  }

  console.log(`\n## The guesses behind it\n`);
  const dead = checks.reduce(
    (sum, c) => ({
      atDeathSpot: sum.atDeathSpot + c.deadSnapshots.atDeathSpot,
      elsewhere: sum.elsewhere + c.deadSnapshots.elsewhere,
    }),
    { atDeathSpot: 0, elsewhere: 0 },
  );
  console.log(
    `- Snapshots taken while a player was dead by the death timer: ${dead.atDeathSpot} exactly at the spot they died, ${dead.elsewhere} somewhere else (back sooner).`,
  );
  const shops = checks.reduce((sum, c) => sum + c.shopEvents, 0);
  const far = checks.flatMap((c) => c.tooFarFromFountain);
  console.log(
    `- Shop events while alive: ${shops}. For ${far.length} (${percent(far.length, shops)}), the next snapshot was too far from the fountain to walk to in time: ${counted(far)}.`,
  );
  distances(
    "Killers, from the kill's spot",
    all((c) => c.killers),
  );
  distances(
    "Players with an assist, from the kill's spot",
    all((c) => c.killHelpers),
  );
  distances(
    "Players who took an epic monster, from its pit",
    all((c) => c.monsterTakers),
  );

  console.log(`\n## Size\n`);
  const points = all((c) => c.pathPoints).sort((a, b) => a - b);
  const bytes = checks.map((c) => c.pathBytes.reduce((sum, b) => sum + b, 0)).sort((a, b) => a - b);
  console.log(`- Path points per player: median ${quantile(points, 0.5)}, most ${points.at(-1)}.`);
  console.log(
    `- All ten paths as JSON, per game: median ${(quantile(bytes, 0.5) / 1000).toFixed(1)} KB, most ${((bytes.at(-1) ?? 0) / 1000).toFixed(1)} KB.`,
  );

  function table(pick: (c: PositionCheck, variant: number) => number[]) {
    console.log(`| Built from | Median | 75% within | 90% within | Within 1,000 | Within 2,000 |`);
    console.log(`|---|---|---|---|---|---|`);
    POSITION_VARIANTS.forEach(({ label }, v) => {
      const misses = all((c) => pick(c, v)).sort((a, b) => a - b);
      console.log(`| ${label} | ${spread(misses)} |`);
    });
  }
}

// "2,434 | 4,120 | 7,384 | 31.2% | 44.0%": the median, the distances 75% and
// 90% of estimates were within, and the share within 1,000 and 2,000.
function spread(sorted: number[]): string {
  const within = (n: number) => percent(sorted.filter((m) => m <= n).length, sorted.length);
  return [
    round(quantile(sorted, 0.5)),
    round(quantile(sorted, 0.75)),
    round(quantile(sorted, 0.9)),
    within(1000),
    within(2000),
  ].join(" | ");
}

function distances(label: string, values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const within = percent(sorted.filter((d) => d <= 1500).length, sorted.length);
  console.log(
    `- ${label}, in snapshots within 3 seconds: ${sorted.length} players, median ${round(quantile(sorted, 0.5))}, 90% within ${round(quantile(sorted, 0.9))}, ${within} within 1,500.`,
  );
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

function round(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function percent(n: number, of: number): string {
  return of === 0 ? "n/a" : `${((100 * n) / of).toFixed(1)}%`;
}

// "Ornn ×5, Shen, Twisted Fate": each name once, most common first.
function counted(names: string[]): string {
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  return (
    [...counts]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([name, n]) => (n > 1 ? `${name} ×${n}` : name))
      .join(", ") || "none"
  );
}

main();
