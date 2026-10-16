// The tempo study (docs/tempo.md): checks the tempo timeline against the
// games that `npm run tempo-games` saved in .cache/tempo-study, and prints a
// report in Markdown.
//
//   npm run study-tempo                            every saved game
//   npm run study-tempo -- --tiers master,grandmaster,challenger
//   npm run study-tempo -- --out tempo-report.md   also save the report
//
// Makes no Riot calls and doesn't touch the database. The question it asks:
// at each minute, did the jungler the timeline calls "up tempo" go on to win
// the next fight a jungler was in, or the next epic monster? And does
// "spent on items" tell you more than plain "who has more gold"?

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { formatGap, plural } from "@/lib/analyzer/format";
import { LEVEL_GOLD, TEMPO_LEAD, type TempoTone } from "@/lib/analyzer/tempo";
import {
  aliveCheck,
  auc,
  callAccuracy,
  crossValidated,
  estimateErrors,
  fitLogistic,
  hash,
  respawnRows,
  STUDY_FEATURES,
  STUDY_FOLDER,
  studyRows,
  type DuelRow,
  type ObjectiveRow,
  type RespawnRow,
  type StudyFeature,
  type StudyGame,
  type StudyRow,
} from "@/lib/analyzer/tempo-study";

const { values: args } = parseArgs({
  options: { tiers: { type: "string" }, out: { type: "string" } },
});

const TIER_GROUPS: [string, string[]][] = [
  ["Master+", ["MASTER", "GRANDMASTER", "CHALLENGER"]],
  ["Emerald-Diamond", ["EMERALD", "DIAMOND"]],
  ["Gold-Platinum", ["GOLD", "PLATINUM"]],
  ["Iron-Silver", ["IRON", "BRONZE", "SILVER"]],
];

const lines: string[] = [];
const say = (line = "") => lines.push(line);

function main() {
  const tiers = args.tiers?.toUpperCase().split(",");
  const games = loadGames().filter((g) => !tiers || tiers.includes(g.tier));
  if (games.length === 0) throw new Error(`No games in ${STUDY_FOLDER}. Run npm run tempo-games first.`);

  const all = games.map(studyRows);
  const minutes = all.flatMap((r) => r.minutes);
  const objectives = all.flatMap((r) => r.objectives);
  const duels = all.flatMap((r) => r.duels);
  const labeled = minutes.filter((r) => r.nextPlay !== null);

  say(`# Tempo study`);
  say();
  say(`Settings: LEVEL_GOLD ${LEVEL_GOLD}, TEMPO_LEAD ${TEMPO_LEAD}.`);
  say();
  say(`## Data`);
  say();
  say(`- ${plural(games.length, "game")}, ${plural(minutes.length, "minute mark")} from minute 2.`);
  say(`- Patches: ${countBy(games, (g) => g.patch)}`);
  say(`- Tiers: ${countBy(games, (g) => g.tier)}`);
  say(`- Minute marks followed by a jungler fight or epic monster within a minute: ${labeled.length} (${pct(labeled.length / minutes.length)}). Blue side won ${pct(mean(labeled.map((r) => r.nextPlay!)))} of them.`);
  say(`- Epic monsters taken: ${countBy(objectives, (o) => o.kind)}`);
  say(`- Kills where one jungler died with the other taking part: ${duels.length}`);
  say(`- Only one jungler alive at ${pct(minutes.filter((r) => r.f.alive !== 0).length / minutes.length)} of minute marks.`);

  const definitions = tunedDefinitions(labeled);
  const check = {
    labeled: labeled.filter((r) => !isTuning(r.matchId)),
    objectives: objectives.filter((o) => !isTuning(o.matchId)),
    duels: duels.filter((d) => !isTuning(d.matchId)),
    games: all.map((r) => r.minutes).filter((rows) => rows.length && !isTuning(rows[0].matchId)),
  };

  timersSection(objectives);
  aliveSection(games);
  estimateSection(games, minutes);
  nextPlaySection(labeled);
  modelsSection(labeled);
  tuningSection(labeled, definitions, check);
  objectivesSection(objectives);
  duelsSection(duels);
  shapeSection(all.map((r) => r.minutes));
  tiersSection(labeled, objectives);
  bootstrapSection(labeled, objectives, definitions, check);

  const report = lines.join("\n") + "\n";
  console.log(report);
  if (args.out) writeFileSync(args.out, report);
}

function loadGames(): StudyGame[] {
  const games: StudyGame[] = [];
  for (const name of readdirSync(STUDY_FOLDER)) {
    if (!name.endsWith(".json")) continue;
    try {
      games.push(JSON.parse(readFileSync(join(STUDY_FOLDER, name), "utf8")) as StudyGame);
    } catch {
      console.error(`Skipped ${name}: not readable`);
    }
  }
  return games;
}

// Are the spawn timers right? A monster taken before the window it was put
// in opened would mean a timer is too late.
function timersSection(objectives: ObjectiveRow[]) {
  say();
  say(`## Spawn timers`);
  say();
  say(`| Monster | Taken | Taken before its timer | Quickest after spawning |`);
  say(`|---|---|---|---|`);
  for (const [kind, rows] of Map.groupBy(objectives, (o) => o.kind)) {
    const early = rows.filter((o) => o.takenAt < o.spawnsAt).length;
    const quickest = Math.min(...rows.map((o) => o.takenAt - o.spawnsAt));
    say(`| ${kind} | ${rows.length} | ${early} | ${seconds(quickest)} |`);
  }
}

function aliveSection(games: StudyGame[]) {
  const total = { bothDead: 0, timerOnly: 0, healthOnly: 0, bothAlive: 0 };
  for (const g of games) {
    const c = aliveCheck(g);
    total.bothDead += c.bothDead;
    total.timerOnly += c.timerOnly;
    total.healthOnly += c.healthOnly;
    total.bothAlive += c.bothAlive;
  }
  say();
  say(`## Death timers against Riot's health snapshots`);
  say();
  say(`Every player at every minute mark: dead by the death timer estimate, and health 0 in Riot's snapshot.`);
  say();
  say(`| | Health 0 | Health above 0 |`);
  say(`|---|---|---|`);
  say(`| Dead by the timer | ${total.bothDead} | ${total.timerOnly} |`);
  say(`| Alive by the timer | ${total.healthOnly} | ${total.bothAlive} |`);
  respawnFit(games.flatMap(respawnRows));
}

// Is the formula's death timer too long or too short? Each death with a
// minute mark soon after it is a yes/no test: still at 0 health at the mark
// means the real timer was longer than the gap. The best scale is the
// multiple of the formula's timer that agrees with the most of them.
function respawnFit(rows: RespawnRow[]) {
  if (rows.length === 0) return;
  say();
  say(`Each death followed by a minute mark within twice its timer (${rows.length} deaths): was the player still at 0 health at the mark? A best scale of 0.90 would mean the real timers were about 90% of the formula's.`);
  say();
  say(`| Deaths | Count | Formula agrees | Best scale | Agrees with it |`);
  say(`|---|---|---|---|---|`);
  const groups: [string, (r: RespawnRow) => boolean][] = [
    ["All", () => true],
    ["Before 15:00", (r) => r.minute < 15],
    ["15:00 to 30:00", (r) => r.minute >= 15 && r.minute < 30],
    ["30:00 on", (r) => r.minute >= 30],
    ["Levels 1-6", (r) => r.level <= 6],
    ["Levels 7-11", (r) => r.level >= 7 && r.level <= 11],
    ["Levels 12-18", (r) => r.level >= 12],
  ];
  for (const [label, keep] of groups) {
    const group = rows.filter(keep);
    if (group.length === 0) continue;
    const agrees = (scale: number) =>
      mean(group.map((r) => Number(r.timerS * scale > r.gapS === r.deadAtMark)));
    let best = 1;
    let bestAgrees = agrees(1);
    for (let step = 50; step <= 150; step++) {
      const scale = step / 100;
      const a = agrees(scale);
      // Ties go to the scale nearest 1.
      if (a > bestAgrees + 1e-12 || (a > bestAgrees - 1e-12 && Math.abs(scale - 1) < Math.abs(best - 1))) {
        best = scale;
        bestAgrees = a;
      }
    }
    say(`| ${label} | ${group.length} | ${pct(agrees(1))} | ${best.toFixed(2)} | ${pct(bestAgrees)} |`);
  }
  const sorted = (xs: number[]) => xs.sort((a, b) => a - b);
  const back = sorted(rows.filter((r) => r.timerS > r.gapS && !r.deadAtMark).map((r) => r.timerS - r.gapS));
  const stillDead = sorted(rows.filter((r) => r.timerS <= r.gapS && r.deadAtMark).map((r) => r.gapS - r.timerS));
  say();
  say(`Back before the formula said: ${back.length}, with a median of ${back.length ? quantile(back, 0.5).toFixed(1) : "-"} s left on the formula's timer (90% within ${back.length ? quantile(back, 0.9).toFixed(1) : "-"} s). Still dead after it said: ${stillDead.length}, median ${stillDead.length ? quantile(stillDead, 0.5).toFixed(1) : "-"} s over (90% within ${stillDead.length ? quantile(stillDead, 0.9).toFixed(1) : "-"} s).`);
}

function estimateSection(games: StudyGame[], minutes: StudyRow[]) {
  const errors = games.flatMap(estimateErrors);
  if (errors.length === 0) return;
  say();
  say(`## Estimated item gold (for games saved before unspent gold was kept)`);
  say();
  say(`Exact item gold minus the estimate, per jungler per minute (${errors.length} of them).`);
  say();
  say(`| Estimate | Average miss | Median miss | 90% within | Average (signed) |`);
  say(`|---|---|---|---|---|`);
  for (const [label, key] of [
    ["Gold on a straight line between snapshots (used)", "line"],
    ["Gold at the snapshot before the visit", "before"],
  ] as const) {
    const misses = errors.map((e) => Math.abs(e[key])).sort((a, b) => a - b);
    say(
      `| ${label} | ${Math.round(mean(misses))} | ${Math.round(quantile(misses, 0.5))} | ${Math.round(quantile(misses, 0.9))} | ${Math.round(mean(errors.map((e) => e[key])))} |`,
    );
  }
  const same = minutes.filter((r) => r.tone === r.toneEst).length;
  say();
  say(`The estimate gives the same call (up, even, down) as the exact numbers at ${pct(same / minutes.length)} of minute marks.`);
}

function nextPlaySection(labeled: StudyRow[]) {
  say();
  say(`## The next play`);
  say();
  say(`For each minute mark followed within a minute by a fight a jungler was in or an epic monster: how well each number, blue minus red, sorts the moments blue's side won from the ones it lost (AUC: 0.5 is a coin flip, 1 is perfect).`);
  say();
  const phases: [string, (r: StudyRow) => boolean][] = [
    ["All", () => true],
    ["2-14", (r) => r.minute < 15],
    ["15-24", (r) => r.minute >= 15 && r.minute < 25],
    ["25+", (r) => r.minute >= 25],
  ];
  say(`| Number | ${phases.map(([p]) => p).join(" | ")} |`);
  say(`|---|${phases.map(() => "---").join("|")}|`);
  for (const key of STUDY_FEATURES) {
    const cells = phases.map(([, keep]) => {
      const rows = labeled.filter(keep);
      return auc(rows.map((r) => ({ score: r.f[key], won: r.nextPlay === 1 }))).toFixed(3);
    });
    say(`| ${key} | ${cells.join(" | ")} |`);
  }
  say(`| (moments) | ${phases.map(([, keep]) => labeled.filter(keep).length).join(" | ")} |`);

  say();
  say(`The timeline's call: how often the side called up tempo won the next play, and how many moments got a call.`);
  say();
  say(`| Call | ${phases.map(([p]) => p).join(" | ")} |`);
  say(`|---|${phases.map(() => "---").join("|")}|`);
  for (const [label, tone] of [
    ["Exact item gold", (r: StudyRow) => r.tone],
    ["Estimated item gold", (r: StudyRow) => r.toneEst],
    ["Junglers' gold only (same threshold)", (r: StudyRow) => toneOf(r.f.gold)],
  ] as const) {
    const cells = phases.map(([, keep]) => {
      const c = callAccuracy(labeled.filter(keep).map((r) => ({ tone: tone(r), won: r.nextPlay === 1 })));
      return `${pct(c.right)} of ${pct(c.share)}`;
    });
    say(`| ${label} | ${cells.join(" | ")} |`);
  }

  say();
  say(`By the size of the lead (items + levels), both junglers alive:`);
  say();
  binTable(
    labeled.filter((r) => r.f.alive === 0),
    (r) => r.f.lead,
    [-Infinity, -2000, -1000, -500, -250, 250, 500, 1000, 2000, Infinity],
  );

  say();
  say(`When both junglers had earned about the same gold (within 250), by how much more blue had spent on items. This is the part of tempo that's about shop timing rather than being ahead:`);
  say();
  binTable(
    labeled.filter((r) => Math.abs(r.f.gold) < 250 && r.f.alive === 0),
    (r) => r.f.itemGold,
    [-Infinity, -1000, -500, -200, 200, 500, 1000, Infinity],
  );

  say();
  say(`The same moments (gold within 250, both alive), by health (blue's share of max health minus red's):`);
  say();
  binTable(
    labeled.filter((r) => Math.abs(r.f.gold) < 250 && r.f.alive === 0),
    (r) => r.f.hp,
    [-Infinity, -0.5, -0.25, -0.1, 0.1, 0.25, 0.5, Infinity],
    (x) => x.toFixed(2),
  );
}

// Each set of numbers as a small model, checked on games it didn't see.
function modelsSection(labeled: StudyRow[]) {
  say();
  say(`## Models of the next play`);
  say();
  say(`Logistic regression on each set of numbers, fitted on 4/5 of the games and checked on the other 1/5, five times. Lower log loss is better (always 50% scores 0.693).`);
  say();
  const sets: [string, StudyFeature[]][] = [
    ["Junglers' gold", ["gold"]],
    ["Team gold", ["teamGold"]],
    ["Junglers' gold, levels, alive", ["gold", "level", "alive"]],
    ["Items, levels, alive (the timeline's inputs)", ["itemGold", "level", "alive"]],
    ["Gold, unspent gold, levels, alive", ["gold", "unspent", "level", "alive"]],
    ["Items, levels, alive, players alive", ["itemGold", "level", "alive", "numbers"]],
    ["Team gold, items, levels, alive, players alive", ["teamGold", "itemGold", "level", "alive", "numbers"]],
    ["... plus health", ["teamGold", "itemGold", "level", "alive", "numbers", "hp"]],
    ["... plus recent camps and time since shopping", ["teamGold", "itemGold", "level", "alive", "numbers", "hp", "jungleCs2", "sinceShop"]],
  ];
  say(`| Numbers | Log loss | AUC |`);
  say(`|---|---|---|`);
  for (const [label, keys] of sets) {
    const { logLoss, auc: a } = crossValidated(asRows(labeled, keys));
    say(`| ${label} | ${logLoss.toFixed(4)} | ${a.toFixed(3)} |`);
  }

  const keys: StudyFeature[] = ["itemGold", "level", "alive"];
  const w = fitLogistic(asRows(labeled, keys));
  say();
  // Gold went in as thousands, so w[1] is per 1,000 gold.
  say(`Weights for items, levels, alive on every game: constant ${w[0].toFixed(3)}, per 1,000 item gold ${w[1].toFixed(3)}, per level ${w[2].toFixed(3)}, alive ${w[3].toFixed(3)}. So one level is worth about ${Math.round((1000 * w[2]) / w[1])} gold of items, and being the only jungler alive about ${Math.round((1000 * w[3]) / w[1])}.`);
  const all: StudyFeature[] = ["teamGold", "itemGold", "level", "alive", "numbers", "hp", "jungleCs2", "sinceShop"];
  const wa = fitLogistic(asRows(labeled, all));
  say();
  say(`Weights with everything: ${all.map((k, i) => `${k} ${wa[i + 1].toPrecision(3)}`).join(", ")} (constant ${wa[0].toFixed(3)}).`);
}

// A way of making the call, for comparing settings: the lead from blue's
// side and how big it has to be. Being the only jungler alive comes first
// in all of them, as in tempo.ts.
type Definition = {
  name: string;
  weights: string;
  lead: (r: StudyRow) => number;
  threshold: number;
  thresholdText: string;
};

type CheckHalf = {
  labeled: StudyRow[];
  objectives: ObjectiveRow[];
  duels: DuelRow[];
  games: StudyRow[][];
};

// Half the games tune the settings and the other half checks them, split by
// match ID so a game is always on the same side.
function isTuning(matchId: string): boolean {
  return hash(matchId) % 2 === 0;
}

function callOf(d: Definition, r: StudyRow): TempoTone {
  if (r.f.alive !== 0) return r.f.alive > 0 ? "ahead" : "behind";
  return toneOf(d.lead(r), d.threshold);
}

// The settings to compare, worked out on the tuning half only. Weights: a
// logistic regression of the next play on the inputs, turned into gold (a
// level is worth as much gold as has the same effect). Threshold: the lead
// at which the side ahead won 55% of next plays, from a fit of the next play
// on that lead alone, with both junglers alive.
function tunedDefinitions(labeled: StudyRow[]): Definition[] {
  const train = labeled.filter((r) => isTuning(r.matchId));
  const round = (x: number, step = 50) => Math.round(x / step) * step;
  const goldPer = (keys: StudyFeature[]) => {
    const w = fitLogistic(asRows(train, keys));
    // asRows gives gold in thousands, so w[1] is per 1,000 gold of keys[0].
    return keys.map((_, i) => round((1000 * w[i + 1]) / w[1]));
  };
  const thresholdFor = (lead: (r: StudyRow) => number, unit: number) => {
    const bothAlive = train.filter((r) => r.f.alive === 0);
    const [, b] = fitLogistic(bothAlive.map((r) => ({ x: [lead(r) / unit], won: r.nextPlay === 1 })));
    return b > 0 ? (unit * Math.log(0.55 / 0.45)) / b : Infinity;
  };
  const gold = (x: number) => Math.round(x).toLocaleString("en-US");
  const definition = (name: string, weights: string, lead: (r: StudyRow) => number): Definition => {
    const threshold = round(thresholdFor(lead, 1000));
    return { name, weights, lead, threshold, thresholdText: gold(threshold) };
  };

  const [, levelA] = goldPer(["itemGold", "level", "alive"]);
  const [, levelB, , playerB] = goldPer(["itemGold", "level", "alive", "numbers"]);
  const [, levelC, , playerC] = goldPer(["gold", "level", "alive", "numbers"]);
  const leadB = (r: StudyRow) => r.f.itemGold + levelB * r.f.level + playerB * r.f.numbers;
  const share = Math.round(thresholdFor((r) => leadB(r) / Math.max(1, r.size), 1) * 100) / 100;

  return [
    {
      name: "First guess",
      weights: "items + 300 a level",
      lead: (r) => r.f.itemGold + 300 * r.f.level,
      threshold: 500,
      thresholdText: "500",
    },
    definition("Items, levels", `items + ${gold(levelA)} a level`, (r) => r.f.itemGold + levelA * r.f.level),
    definition("Items, levels, players alive", `items + ${gold(levelB)} a level + ${gold(playerB)} a player`, leadB),
    definition(
      "Total gold, levels, players alive",
      `gold + ${gold(levelC)} a level + ${gold(playerC)} a player`,
      (r) => r.f.gold + levelC * r.f.level + playerC * r.f.numbers,
    ),
    {
      name: "Items, levels, players alive, as a share",
      weights: "the lead above ÷ the junglers' average gold",
      lead: (r) => leadB(r) / Math.max(1, r.size),
      threshold: share,
      thresholdText: pct(share),
    },
    {
      name: "Current settings (tempo.ts)",
      weights: `items + ${gold(LEVEL_GOLD)} a level`,
      lead: (r) => r.f.lead,
      threshold: TEMPO_LEAD,
      thresholdText: gold(TEMPO_LEAD),
    },
  ];
}

function evaluate(d: Definition, check: CheckHalf) {
  const next = callAccuracy(check.labeled.map((r) => ({ tone: callOf(d, r), won: r.nextPlay === 1 })));
  const leadAuc = auc(check.labeled.map((r) => ({ score: r.f.alive * 1e9 + d.lead(r), won: r.nextPlay === 1 })));
  const monsters = callAccuracy(
    check.objectives.flatMap((o) => (o.minuteBefore ? [{ tone: callOf(d, o.minuteBefore), won: o.blueTook }] : [])),
  );
  const kills = callAccuracy(check.duels.flatMap((x) => (x.before ? [{ tone: callOf(d, x.before), won: x.blueWon }] : [])));
  const rows = check.games.flat();
  const even = rows.filter((r) => callOf(d, r) === "even").length / Math.max(1, rows.length);
  const flips = mean(check.games.map((g) => g.slice(1).filter((r, i) => callOf(d, r) !== callOf(d, g[i])).length));
  return { next, leadAuc, monsters, kills, even, flips };
}

function tuningSection(labeled: StudyRow[], definitions: Definition[], check: CheckHalf) {
  const train = labeled.filter((r) => isTuning(r.matchId));
  const score = (r: StudyRow, levelGold: number) => r.f.alive * 1e9 + r.f.itemGold + levelGold * r.f.level;
  say();
  say(`## Tuning`);
  say();
  say(`Games are split in two by match ID: ${new Set(train.map((r) => r.matchId)).size} tune the settings and ${new Set(check.labeled.map((r) => r.matchId)).size} check them.`);
  say();
  say(`Level weight: AUC of items + weight × levels (being the only one alive first) for the next play.`);
  say();
  say(`| Gold per level | Tuning half | Check half |`);
  say(`|---|---|---|`);
  for (const levelGold of [0, 200, 400, 600, 800, 1000, 1200, 1500, 2000, 3000]) {
    const a = (rows: StudyRow[]) => auc(rows.map((r) => ({ score: score(r, levelGold), won: r.nextPlay === 1 })));
    say(`| ${levelGold} | ${a(train).toFixed(4)} | ${a(check.labeled).toFixed(4)} |`);
  }

  say();
  say(`Each way of making the call, with weights and threshold worked out on the tuning half (a logistic regression turned into gold, and the lead at which the side ahead won 55% of next plays), checked on the other half. "Right" is how often the side called up tempo won, "of" the share of moments that got a call.`);
  say();
  say(`| Call | Lead | Counts from | Next play | AUC | Epic monsters (1+ min before) | Jungler kills | Even minutes | Changes a game |`);
  say(`|---|---|---|---|---|---|---|---|---|`);
  for (const d of definitions) {
    const e = evaluate(d, check);
    const rightOf = (c: { right: number; share: number }) => `${pct(c.right)} of ${pct(c.share)}`;
    say(
      `| ${d.name} | ${d.weights} | ${d.thresholdText} | ${rightOf(e.next)} | ${e.leadAuc.toFixed(3)} | ${rightOf(e.monsters)} | ${rightOf(e.kills)} | ${pct(e.even)} | ${e.flips.toFixed(1)} |`,
    );
  }

  say();
  say(`The same calls on the check half by game phase (next play):`);
  say();
  const phases: [string, (r: StudyRow) => boolean][] = [
    ["2-14", (r) => r.minute < 15],
    ["15-24", (r) => r.minute >= 15 && r.minute < 25],
    ["25+", (r) => r.minute >= 25],
  ];
  say(`| Call | ${phases.map(([p]) => p).join(" | ")} |`);
  say(`|---|${phases.map(() => "---").join("|")}|`);
  for (const d of definitions) {
    const cells = phases.map(([, keep]) => {
      const c = callAccuracy(check.labeled.filter(keep).map((r) => ({ tone: callOf(d, r), won: r.nextPlay === 1 })));
      return `${pct(c.right)} of ${pct(c.share)}`;
    });
    say(`| ${d.name} | ${cells.join(" | ")} |`);
  }
}

function objectivesSection(objectives: ObjectiveRow[]) {
  say();
  say(`## Epic monsters`);
  say();
  say(`Who took each epic monster, against the call at the minute mark before it was taken, at least a minute before, and when it spawned: how often the side called up tempo took it, of the share that got a call. AUC compares the tempo lead with team gold as a guide to who takes it.`);
  say();
  say(`| Monster | Taken | Blue took | Call just before | Call 1+ min before | Call at spawn | AUC lead | AUC team gold |`);
  say(`|---|---|---|---|---|---|---|---|`);
  const groups: [string, typeof objectives][] = [["all", objectives], ...Map.groupBy(objectives, (o) => o.kind)];
  for (const [kind, rows] of groups) {
    const call = (pick: (o: (typeof rows)[number]) => StudyRow | null) => {
      const points = rows.flatMap((o) => {
        const r = pick(o);
        return r ? [{ tone: r.tone, won: o.blueTook }] : [];
      });
      const c = callAccuracy(points);
      return `${pct(c.right)} of ${pct(c.share)} (${points.length})`;
    };
    const aucOf = (key: StudyFeature) =>
      auc(rows.flatMap((o) => (o.minuteBefore ? [{ score: o.minuteBefore.f[key], won: o.blueTook }] : []))).toFixed(3);
    say(
      `| ${kind} | ${rows.length} | ${pct(mean(rows.map((o) => Number(o.blueTook))))} | ${call((o) => o.before)} | ${call((o) => o.minuteBefore)} | ${call((o) => o.atSpawn)} | ${aucOf("lead")} | ${aucOf("teamGold")} |`,
    );
  }
}

function duelsSection(duels: DuelRow[]) {
  const withRow = duels.filter((d) => d.before);
  say();
  say(`## Jungler against jungler`);
  say();
  const c = callAccuracy(withRow.map((d) => ({ tone: d.before!.tone, won: d.blueWon })));
  say(`Kills where one jungler died with the other taking part: ${duels.length}. The jungler called up tempo at the minute mark before won ${pct(c.right)} of the ${c.calls} that got a call (${pct(c.share)}).`);
  say(`AUC of the tempo lead: ${auc(withRow.map((d) => ({ score: d.before!.f.lead, won: d.blueWon }))).toFixed(3)}; of junglers' gold: ${auc(withRow.map((d) => ({ score: d.before!.f.gold, won: d.blueWon }))).toFixed(3)}; of levels: ${auc(withRow.map((d) => ({ score: d.before!.f.level, won: d.blueWon }))).toFixed(3)}.`);
}

// How the timeline looks: how often it changes its mind, and how much of a
// game each call covers.
function shapeSection(games: StudyRow[][]) {
  const flips = games.map((rows) => rows.slice(1).filter((r, i) => r.tone !== rows[i].tone).length);
  const all = games.flat();
  const share = (tone: TempoTone) => pct(all.filter((r) => r.tone === tone).length / all.length);
  say();
  say(`## Shape of a timeline`);
  say();
  say(`Blue up tempo ${share("ahead")} of minutes, red ${share("behind")}, even ${share("even")}. The call changes ${mean(flips).toFixed(1)} times a game on average (median ${quantile([...flips].sort((a, b) => a - b), 0.5)}).`);
}

function tiersSection(labeled: StudyRow[], objectives: ObjectiveRow[]) {
  const regions = [...new Set(labeled.map((r) => r.region))].sort();
  const regionOf = new Map(labeled.map((r) => [r.matchId, r.region]));
  const groups: [string, (x: { tier: string; matchId: string }) => boolean][] = [
    ...TIER_GROUPS.map(([label, tiers]): [string, (x: { tier: string }) => boolean] => [label, (x) => tiers.includes(x.tier)]),
    ...regions.map((region): [string, (x: { matchId: string }) => boolean] => [
      `Server: ${region}`,
      (x) => regionOf.get(x.matchId) === region,
    ]),
  ];
  say();
  say(`## By rank and server`);
  say();
  say(`| Games | Count | Next play: call right | AUC lead | AUC junglers' gold | Epic monsters: call right (1+ min before) |`);
  say(`|---|---|---|---|---|---|`);
  for (const [label, keep] of groups) {
    const rows = labeled.filter(keep);
    if (rows.length === 0) continue;
    const c = callAccuracy(rows.map((r) => ({ tone: r.tone, won: r.nextPlay === 1 })));
    const obj = objectives.filter((o) => keep(o) && o.minuteBefore);
    const co = callAccuracy(obj.map((o) => ({ tone: o.minuteBefore!.tone, won: o.blueTook })));
    say(
      `| ${label} | ${new Set(rows.map((r) => r.matchId)).size} | ${pct(c.right)} of ${pct(c.share)} | ${aucOf(rows, "lead").toFixed(3)} | ${aucOf(rows, "gold").toFixed(3)} | ${pct(co.right)} of ${pct(co.share)} |`,
    );
  }
}

// How sure are the main numbers? Games are drawn at random with
// replacement, 200 times, and each number is worked out again on every
// draw; the middle 95% of the results is the range shown. Whole games are
// drawn, not single minutes, because minutes of the same game aren't
// independent.
type Sample = { labeled: StudyRow[]; objectives: ObjectiveRow[] };

function bootstrapSection(
  labeled: StudyRow[],
  objectives: ObjectiveRow[],
  definitions: Definition[],
  check: CheckHalf,
) {
  const rightOn = (d: Definition | null, rows: StudyRow[]) =>
    callAccuracy(rows.map((r) => ({ tone: d ? callOf(d, r) : r.tone, won: r.nextPlay === 1 }))).right;
  const leadAuc = (d: Definition, rows: StudyRow[]) =>
    auc(rows.map((r) => ({ score: r.f.alive * 1e9 + d.lead(r), won: r.nextPlay === 1 })));
  const [firstGuess, ...rest] = definitions;
  const measures: [string, (s: Sample) => number][] = [
    ["Next play: call right", (s) => rightOn(null, s.labeled)],
    ["Next play: AUC of the tempo lead", (s) => aucOf(s.labeled, "lead")],
    ["Next play: AUC of the lead minus AUC of junglers' gold", (s) => aucOf(s.labeled, "lead") - aucOf(s.labeled, "gold")],
    ["Next play: AUC of the lead minus AUC of team gold", (s) => aucOf(s.labeled, "lead") - aucOf(s.labeled, "teamGold")],
    [
      "Epic monsters: call right, 1+ min before",
      (s) =>
        callAccuracy(s.objectives.flatMap((o) => (o.minuteBefore ? [{ tone: o.minuteBefore.tone, won: o.blueTook }] : []))).right,
    ],
  ];
  const checkMeasures: [string, (s: Sample) => number][] = rest.flatMap((d): [string, (s: Sample) => number][] => [
    [`${d.name}: call right`, (s) => rightOn(d, s.labeled)],
    [`${d.name}: AUC minus first guess's`, (s) => leadAuc(d, s.labeled) - leadAuc(firstGuess, s.labeled)],
  ]);

  say();
  say(`## How sure`);
  say();
  say(`95% ranges from redrawing the games 200 times.`);
  say();
  say(`| Number | Value | 95% range |`);
  say(`|---|---|---|`);
  for (const line of bootstrap({ labeled, objectives }, measures)) say(line);
  say();
  say(`On the check half only, for the settings tuned on the other half:`);
  say();
  say(`| Number | Value | 95% range |`);
  say(`|---|---|---|`);
  for (const line of bootstrap({ labeled: check.labeled, objectives: check.objectives }, checkMeasures)) say(line);
}

function bootstrap(sample: Sample, measures: [string, (s: Sample) => number][]): string[] {
  const byGame = Map.groupBy(sample.labeled, (r) => r.matchId);
  const objectivesByGame = Map.groupBy(sample.objectives, (o) => o.matchId);
  const ids = [...byGame.keys()];
  let seed = 7;
  const random = () => {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
    return seed / 2_147_483_648;
  };
  const draws = measures.map(() => [] as number[]);
  for (let draw = 0; draw < 200; draw++) {
    const picked = Array.from({ length: ids.length }, () => ids[Math.floor(random() * ids.length)]);
    const drawn: Sample = {
      labeled: picked.flatMap((id) => byGame.get(id) ?? []),
      objectives: picked.flatMap((id) => objectivesByGame.get(id) ?? []),
    };
    measures.forEach(([, measure], i) => draws[i].push(measure(drawn)));
  }
  return measures.map(([label, measure], i) => {
    const sorted = draws[i].sort((a, b) => a - b);
    return `| ${label} | ${measure(sample).toFixed(3)} | ${quantile(sorted, 0.025).toFixed(3)} to ${quantile(sorted, 0.975).toFixed(3)} |`;
  });
}

function aucOf(rows: StudyRow[], key: StudyFeature): number {
  return auc(rows.map((r) => ({ score: r.f[key], won: r.nextPlay === 1 })));
}

// --- Helpers ---

function binTable(rows: StudyRow[], value: (r: StudyRow) => number, edges: number[], label = (x: number) => formatGap(x, 0).text) {
  say(`| Range | Moments | Blue won the next play |`);
  say(`|---|---|---|`);
  for (let i = 0; i < edges.length - 1; i++) {
    const inBin = rows.filter((r) => value(r) >= edges[i] && value(r) < edges[i + 1]);
    const from = Number.isFinite(edges[i]) ? label(edges[i]) : "";
    const to = Number.isFinite(edges[i + 1]) ? label(edges[i + 1]) : "";
    const range = !from ? `under ${to}` : !to ? `${from} or more` : `${from} to ${to}`;
    say(`| ${range} | ${inBin.length} | ${inBin.length ? pct(mean(inBin.map((r) => r.nextPlay!))) : "-"} |`);
  }
}

function asRows(rows: StudyRow[], keys: StudyFeature[]) {
  return rows.map((r) => ({
    matchId: r.matchId,
    // Gold in thousands keeps the numbers a similar size.
    x: keys.map((k) => (GOLD_FEATURES.has(k) ? r.f[k] / 1000 : r.f[k])),
    won: r.nextPlay === 1,
  }));
}

const GOLD_FEATURES = new Set<StudyFeature>(["gold", "itemGold", "itemGoldEst", "unspent", "teamGold", "xp", "lead", "leadEst"]);

function toneOf(lead: number, threshold = TEMPO_LEAD): TempoTone {
  return lead >= threshold ? "ahead" : lead <= -threshold ? "behind" : "even";
}

function countBy<T>(items: T[], key: (item: T) => string): string {
  return [...Map.groupBy(items, key)]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([k, v]) => `${k} ${v.length}`)
    .join(", ");
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

// `sorted` must be sorted already.
function quantile(sorted: number[], q: number): number {
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0;
}

function pct(share: number): string {
  return `${(share * 100).toFixed(1)}%`;
}

function seconds(ms: number): string {
  if (!Number.isFinite(ms)) return "-";
  const s = Math.round(ms / 1000);
  return `${s < 0 ? "-" : ""}${Math.floor(Math.abs(s) / 60)}:${String(Math.abs(s) % 60).padStart(2, "0")}`;
}

main();
