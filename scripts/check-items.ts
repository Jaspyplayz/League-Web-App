// The item check (docs/replay.md): rebuilds every player's items in the games
// that `npm run tempo-games -- --raw` saved in .cache/item-check, and compares
// what each player ends the game with to the items Riot lists after the game.
// Prints how often they match, which items go wrong most often, and the item
// events behind a few of the misses.
//
//   npm run check-items
//
// Makes no Riot calls and doesn't touch the database.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { formatClock, plural } from "@/lib/analyzer/format";
import { checkItems, ITEM_CHECK_FOLDER, type ItemCheck } from "@/lib/analyzer/item-check";
import { trimTimeline } from "@/lib/analyzer/trim";
import type { Match, Timeline } from "@/lib/riot/types";

// How many misses to show the item events for, per kind of miss.
const EXAMPLES = 1;
const CONTROL_WARD = 2055;

type Miss = { label: string; players: number; examples: string[] };

function main() {
  const files = readdirSync(ITEM_CHECK_FOLDER).filter((name) => name.endsWith(".json"));
  if (files.length === 0) {
    throw new Error(`No games in ${ITEM_CHECK_FOLDER}. Run: npm run tempo-games -- --raw`);
  }

  let players = 0;
  let itemsRight = 0;
  let trinketRight = 0;
  let allRight = 0;
  const misses = new Map<string, Miss>();
  const eventTypes = new Map<string, number>();
  const wards = { buyers: 0, endWithOne: 0, placedRule: 0, neverShownRule: 0, unpairedLeaving: 0 };
  const firstTrinket = new Map<string, number>();

  for (const file of files) {
    const { match, timeline } = JSON.parse(readFileSync(join(ITEM_CHECK_FOLDER, file), "utf8")) as {
      match: Match;
      timeline: Timeline;
    };
    for (const e of rawEvents(timeline)) eventTypes.set(e.type, (eventTypes.get(e.type) ?? 0) + 1);

    countControlWards(match, timeline, wards);
    countFirstTrinkets(match, timeline, firstTrinket);

    for (const check of checkItems(match, trimTimeline(timeline))) {
      players++;
      const items = check.missing.length === 0 && check.extra.length === 0;
      const trinket = check.trinket.riot === check.trinket.rebuilt;
      if (items) itemsRight++;
      if (trinket) trinketRight++;
      if (items && trinket) allRight++;

      // One entry per kind of miss, counted once per player.
      const labels = new Set([
        ...check.missing.map((id) => `Riot lists ${id}, the rebuild doesn't`),
        ...check.extra.map((id) => `The rebuild has ${id}, Riot doesn't list it`),
        ...(trinket ? [] : [`Trinket: Riot ${check.trinket.riot}, rebuilt ${check.trinket.rebuilt}`]),
      ]);
      for (const label of labels) {
        const miss = misses.get(label) ?? { label, players: 0, examples: [] };
        miss.players++;
        if (miss.examples.length < EXAMPLES) miss.examples.push(example(match, timeline, check));
        misses.set(label, miss);
      }
    }
  }

  const share = (n: number) => `${((100 * n) / players).toFixed(1)}%`;
  console.log(`# Item check\n`);
  console.log(`${plural(files.length, "game")}, ${plural(players, "player")}.\n`);
  console.log(`- Six items right (in any slot): ${itemsRight} (${share(itemsRight)})`);
  console.log(`- Trinket right: ${trinketRight} (${share(trinketRight)})`);
  console.log(`- Both right: ${allRight} (${share(allRight)})\n`);

  console.log(`## Misses, most common first\n`);
  const sorted = [...misses.values()].sort((a, b) => b.players - a.players);
  for (const miss of sorted) console.log(`- ${miss.label}: ${plural(miss.players, "player")}`);

  console.log(`\n## Item events behind the most common misses\n`);
  for (const miss of sorted.slice(0, 10)) {
    console.log(`### ${miss.label}\n`);
    for (const lines of miss.examples) console.log(`${lines}\n`);
  }

  console.log(`## Control wards\n`);
  console.log(`- Players who bought at least one: ${wards.buyers}`);
  console.log(`- Of those, Riot lists one in their items at the end: ${wards.endWithOne}`);
  console.log(`- Control wards leaving with no purchase at the same millisecond: ${wards.unpairedLeaving}`);
  console.log(`- "Bought minus placed" (WARD_PLACED, CONTROL_WARD) says right whether they end with one: ${wards.placedRule} of ${wards.buyers}`);
  console.log(`- "Never shown" is right for: ${wards.neverShownRule} of ${wards.buyers}\n`);

  console.log(`## Each player's first trinket event\n`);
  for (const [kind, count] of [...firstTrinket].sort((a, b) => b[1] - a[1])) {
    console.log(`- ${kind}: ${count}`);
  }
  console.log();

  console.log(`## Event types in these timelines\n`);
  for (const [type, count] of [...eventTypes].sort((a, b) => b[1] - a[1])) {
    console.log(`- ${type}: ${count}`);
  }
}

type RawEvent = Timeline["info"]["frames"][number]["events"][number];

function rawEvents(timeline: Timeline): RawEvent[] {
  return timeline.info.frames.flatMap((frame) => frame.events);
}

// Riot logs each control ward bought as one leaving and one arriving at the
// same millisecond, and nothing in the item events when one is placed. Two
// ways to show them: never, or bought minus placed (from WARD_PLACED). Both
// are checked against whether Riot lists one at the end.
function countControlWards(match: Match, timeline: Timeline, wards: Record<string, number>) {
  const events = rawEvents(timeline);
  for (const p of match.info.participants) {
    const mine = events.filter((e) => e.participantId === p.participantId);
    const bought = mine.filter((e) => e.type === "ITEM_PURCHASED" && e.itemId === CONTROL_WARD);
    const leaving = mine.filter((e) => e.type === "ITEM_DESTROYED" && e.itemId === CONTROL_WARD);
    const boughtAt = new Set(bought.map((e) => e.timestamp));
    wards.unpairedLeaving += leaving.filter((e) => !boughtAt.has(e.timestamp)).length;
    if (bought.length === 0) continue;

    const placed = events.filter(
      (e) => e.type === "WARD_PLACED" && e.creatorId === p.participantId && e.wardType === "CONTROL_WARD",
    ).length;
    const endsWithOne = [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5].includes(CONTROL_WARD);
    wards.buyers++;
    if (endsWithOne) wards.endWithOne++;
    if (bought.length - placed > 0 === endsWithOne) wards.placedRule++;
    if (!endsWithOne) wards.neverShownRule++;
  }
}

// Whether each player's first trinket event is one leaving (so they had it
// from the start without a purchase in the log) or one bought, and when.
function countFirstTrinkets(match: Match, timeline: Timeline, counts: Map<string, number>) {
  const trinkets = new Set([3330, 3340, 3363, 3364]);
  const events = rawEvents(timeline);
  for (const p of match.info.participants) {
    const first = events.find(
      (e) =>
        e.participantId === p.participantId &&
        e.type.startsWith("ITEM_") &&
        trinkets.has(Number(e.itemId ?? e.beforeId ?? e.afterId)),
    );
    const kind = !first
      ? `none (Riot lists ${p.item6} at the end)`
      : `${first.type} ${first.itemId ?? `${first.beforeId} -> ${first.afterId}`}${first.timestamp < 60_000 ? " in the first minute" : ""}`;
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
}

// One player's final items, Riot's and rebuilt, and every item event of
// theirs in the untrimmed timeline, in the order Riot logged them.
function example(match: Match, timeline: Timeline, check: ItemCheck): string {
  const p = match.info.participants.find((x) => x.participantId === check.participantId)!;
  const riot = [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6].join(" ");
  const lines = [
    `${match.metadata.matchId} ${check.championName} (participant ${check.participantId}, ${p.teamPosition || "no role"}). Riot's items: ${riot}. Missing: ${check.missing.join(" ") || "none"}. Extra: ${check.extra.join(" ") || "none"}. Trinket rebuilt: ${check.trinket.rebuilt}.`,
  ];
  for (const e of rawEvents(timeline)) {
    if (!e.type.startsWith("ITEM_") || e.participantId !== check.participantId) continue;
    const ids = e.type === "ITEM_UNDO" ? `${e.beforeId} -> ${e.afterId} (gold ${e.goldGain})` : `${e.itemId}`;
    lines.push(`    ${formatClock(e.timestamp)} (${e.timestamp}) ${e.type} ${ids}`);
  }
  return lines.join("\n");
}

main();
