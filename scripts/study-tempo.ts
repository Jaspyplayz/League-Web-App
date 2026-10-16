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
  STUDY_FEATURES,
  STUDY_FOLDER,
  studyRows,
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

  timersSection(objectives);
  aliveSection(games);
  estimateSection(games, minutes);
  nextPlaySection(labeled);
  modelsSection(labeled);
  tuningSection(labeled);
  objectivesSection(objectives);
  duelsSection(duels);
  shapeSection(all.map((r) => r.minutes));
  tiersSection(labeled, objectives);
  bootstrapSection(labeled, objectives);

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
function timersSection(objectives: ReturnType<typeof studyRows>["objectives"]) {
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

// Which level weight and threshold work best, on half the games, checked on
// the other half.
function tuningSection(labeled: StudyRow[]) {
  const train = labeled.filter((r) => hash(r.matchId) % 2 === 0);
  const test = labeled.filter((r) => hash(r.matchId) % 2 === 1);
  const score = (r: StudyRow, levelGold: number) =>
    r.f.alive * 1e6 + r.f.itemGold + levelGold * r.f.level;
  say();
  say(`## Tuning`);
  say();
  say(`Level weight: AUC of items + weight × levels (being the only one alive first), on half the games (tuning) and the other half (check).`);
  say();
  say(`| Gold per level | Tuning half | Check half |`);
  say(`|---|---|---|`);
  for (const levelGold of [0, 100, 200, 300, 400, 500, 600, 800, 1000]) {
    const a = (rows: StudyRow[]) => auc(rows.map((r) => ({ score: score(r, levelGold), won: r.nextPlay === 1 })));
    say(`| ${levelGold} | ${a(train).toFixed(4)} | ${a(test).toFixed(4)} |`);
  }
  say();
  say(`Threshold, with LEVEL_GOLD ${LEVEL_GOLD}: how often the side called up tempo won the next play, and the share of moments called, on the check half.`);
  say();
  say(`| Threshold | Tuning half | Check half |`);
  say(`|---|---|---|`);
  for (const threshold of [0, 250, 500, 750, 1000, 1500, 2000]) {
    const call = (rows: StudyRow[]) => {
      const c = callAccuracy(
        rows.map((r) => ({
          tone: r.f.alive !== 0 ? (r.f.alive > 0 ? "ahead" : "behind") : toneOf(r.f.lead, threshold),
          won: r.nextPlay === 1,
        })),
      );
      return `${pct(c.right)} of ${pct(c.share)}`;
    };
    say(`| ${threshold} | ${call(train)} | ${call(test)} |`);
  }
}

function objectivesSection(objectives: ReturnType<typeof studyRows>["objectives"]) {
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

function duelsSection(duels: ReturnType<typeof studyRows>["duels"]) {
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

function tiersSection(labeled: StudyRow[], objectives: ReturnType<typeof studyRows>["objectives"]) {
  say();
  say(`## By rank`);
  say();
  say(`| Ranks | Games | Next play: call right | AUC lead | AUC junglers' gold | Epic monsters: call right (1+ min before) |`);
  say(`|---|---|---|---|---|---|`);
  for (const [label, tiers] of TIER_GROUPS) {
    const rows = labeled.filter((r) => tiers.includes(r.tier));
    if (rows.length === 0) continue;
    const c = callAccuracy(rows.map((r) => ({ tone: r.tone, won: r.nextPlay === 1 })));
    const obj = objectives.filter((o) => tiers.includes(o.tier) && o.minuteBefore);
    const co = callAccuracy(obj.map((o) => ({ tone: o.minuteBefore!.tone, won: o.blueTook })));
    say(
      `| ${label} | ${new Set(rows.map((r) => r.matchId)).size} | ${pct(c.right)} of ${pct(c.share)} | ${auc(rows.map((r) => ({ score: r.f.lead, won: r.nextPlay === 1 }))).toFixed(3)} | ${auc(rows.map((r) => ({ score: r.f.gold, won: r.nextPlay === 1 }))).toFixed(3)} | ${pct(co.right)} of ${pct(co.share)} |`,
    );
  }
}

// How sure are the main numbers? Games are drawn at random with
// replacement, 200 times, and each number is worked out again on every
// draw; the middle 95% of the results is the range shown. Whole games are
// drawn, not single minutes, because minutes of the same game aren't
// independent.
function bootstrapSection(labeled: StudyRow[], objectives: ReturnType<typeof studyRows>["objectives"]) {
  const byGame = Map.groupBy(labeled, (r) => r.matchId);
  const objectivesByGame = Map.groupBy(objectives, (o) => o.matchId);
  const ids = [...byGame.keys()];
  let seed = 7;
  const random = () => {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
    return seed / 2_147_483_648;
  };
  const measures: [string, (rows: StudyRow[], objs: typeof objectives) => number][] = [
    ["Next play: call right", (rows) => callAccuracy(rows.map((r) => ({ tone: r.tone, won: r.nextPlay === 1 }))).right],
    ["Next play: AUC of the tempo lead", (rows) => aucOf(rows, "lead")],
    ["Next play: AUC of the lead minus AUC of junglers' gold", (rows) => aucOf(rows, "lead") - aucOf(rows, "gold")],
    ["Next play: AUC of the lead minus AUC of team gold", (rows) => aucOf(rows, "lead") - aucOf(rows, "teamGold")],
    [
      "Epic monsters: call right, 1+ min before",
      (_, objs) =>
        callAccuracy(objs.flatMap((o) => (o.minuteBefore ? [{ tone: o.minuteBefore.tone, won: o.blueTook }] : []))).right,
    ],
  ];
  const draws = measures.map(() => [] as number[]);
  for (let draw = 0; draw < 200; draw++) {
    const picked = Array.from({ length: ids.length }, () => ids[Math.floor(random() * ids.length)]);
    const rows = picked.flatMap((id) => byGame.get(id) ?? []);
    const objs = picked.flatMap((id) => objectivesByGame.get(id) ?? []);
    measures.forEach(([, measure], i) => draws[i].push(measure(rows, objs)));
  }
  say();
  say(`## How sure`);
  say();
  say(`95% ranges from redrawing the games 200 times.`);
  say();
  say(`| Number | Value | 95% range |`);
  say(`|---|---|---|`);
  measures.forEach(([label, measure], i) => {
    const sorted = draws[i].sort((a, b) => a - b);
    const value = measure(labeled, objectives);
    say(`| ${label} | ${value.toFixed(3)} | ${quantile(sorted, 0.025).toFixed(3)} to ${quantile(sorted, 0.975).toFixed(3)} |`);
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
