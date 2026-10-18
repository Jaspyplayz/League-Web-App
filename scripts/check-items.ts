// The item check (docs/replay.md): rebuilds every player's items in the games
// that `npm run tempo-games -- --items` saved in .cache/item-check, and compares
// what each player ends the game with to the items Riot lists after the game.
// Prints how often they match, which items go wrong most often, and the item
// events behind each kind of miss.
//
//   npm run check-items
//
// Makes no Riot calls and doesn't touch the database.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { formatClock, plural } from "@/lib/analyzer/format";
import {
  checkItems,
  ITEM_CHECK_FOLDER,
  type ItemCheck,
  type ItemCheckGame,
} from "@/lib/analyzer/item-check";
import type { Timeline } from "@/lib/riot/types";

// How many misses to show the item events for, per kind of miss.
const EXAMPLES = 2;

type Miss = { label: string; players: number; examples: string[] };

function main() {
  const files = readdirSync(ITEM_CHECK_FOLDER).filter((name) => name.endsWith(".json"));
  if (files.length === 0) {
    throw new Error(`No games in ${ITEM_CHECK_FOLDER}. Run: npm run tempo-games -- --items`);
  }

  let players = 0;
  let itemsRight = 0;
  let trinketRight = 0;
  let allRight = 0;
  const misses = new Map<string, Miss>();
  const bootsSlots: string[] = [];
  const tooMany: string[] = [];
  const eventTypes = new Map<string, number>();

  for (const file of files) {
    const game = JSON.parse(readFileSync(join(ITEM_CHECK_FOLDER, file), "utf8")) as ItemCheckGame;
    for (const e of rawEvents(game.timeline)) {
      eventTypes.set(e.type, (eventTypes.get(e.type) ?? 0) + 1);
    }

    for (const check of checkItems(game)) {
      players++;
      const items = check.missing.length === 0 && check.extra.length === 0;
      const trinket = check.trinket.riot === check.trinket.rebuilt;
      if (items) itemsRight++;
      if (trinket) trinketRight++;
      if (items && trinket) allRight++;
      if (check.boots) bootsSlots.push(bootsLine(game, check));
      if (check.tooMany !== null) {
        // The first few with their events, the rest by name.
        const at = check.tooMany;
        tooMany.push(
          tooMany.length < EXAMPLES
            ? `At ${formatClock(at)}: ${example(game, check, [], [at - 30_000, at])}`
            : `${check.championName} at ${formatClock(at)}`,
        );
      }

      // One entry per kind of miss, counted once per player, with the items
      // its examples should show the events for.
      const kinds = new Map<string, number[]>([
        ...check.missing.map((id): [string, number[]] => [`Riot lists ${id}, the rebuild doesn't`, [id]]),
        ...check.extra.map((id): [string, number[]] => [`The rebuild has ${id}, Riot doesn't list it`, [id]]),
      ]);
      if (!trinket) {
        const { riot, rebuilt } = check.trinket;
        kinds.set(`Trinket: Riot ${riot}, rebuilt ${rebuilt}`, [riot, rebuilt, 3513]);
      }
      for (const [label, ids] of kinds) {
        const miss = misses.get(label) ?? { label, players: 0, examples: [] };
        miss.players++;
        if (miss.examples.length < EXAMPLES) miss.examples.push(example(game, check, ids));
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

  console.log(`\n## The item events behind each kind of miss\n`);
  console.log(`The events about the items in the miss, and the player's other item events at those moments.\n`);
  for (const miss of sorted) {
    console.log(`### ${miss.label}\n`);
    for (const lines of miss.examples) console.log(`${lines}\n`);
  }

  console.log(`## More than six items\n`);
  console.log(`${plural(tooMany.length, "player")} held more than six items at some point in the rebuild, so it missed an item leaving. The first ones, with their item events in the 30 seconds before:\n`);
  for (const line of tooMany.slice(0, EXAMPLES)) console.log(`${line}\n`);
  console.log(`Others: ${tooMany.slice(EXAMPLES).join(", ") || "none"}\n`);

  console.log(`## Bot lane boots slots\n`);
  console.log(`${plural(bootsSlots.length, "player")} ended with boots in the slot the bot lane quest unlocks.\n`);
  for (const line of bootsSlots.slice(0, 15)) console.log(`- ${line}`);

  console.log(`\n## Event types in these timelines\n`);
  for (const [type, count] of [...eventTypes].sort((a, b) => b[1] - a[1])) {
    console.log(`- ${type}: ${count}`);
  }
}

type RawEvent = Timeline["info"]["frames"][number]["events"][number];

function rawEvents(timeline: Timeline): RawEvent[] {
  return timeline.info.frames.flatMap((frame) => frame.events);
}

// The item a raw event is about: for an undo, the item bought or sold.
function itemOf(e: RawEvent): number {
  return Number(e.itemId ?? (e.beforeId || e.afterId) ?? 0);
}

// One player's final items, Riot's and rebuilt, then their item events
// about `ids`, with their other item events at the same milliseconds, and
// all of them in `window` (from, to) if given.
function example(
  { match, timeline }: ItemCheckGame,
  check: ItemCheck,
  ids: number[],
  window?: [number, number],
): string {
  const p = match.info.participants.find((x) => x.participantId === check.participantId)!;
  const riot = [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6].join(" ");
  const mine = rawEvents(timeline).filter(
    (e) => e.type.startsWith("ITEM_") && e.participantId === check.participantId,
  );
  const inWindow = (t: number) => window !== undefined && t >= window[0] && t <= window[1];
  const moments = new Set(
    mine.filter((e) => ids.includes(itemOf(e)) || inWindow(e.timestamp)).map((e) => e.timestamp),
  );
  const lines = [
    `${match.metadata.matchId} ${check.championName} (participant ${check.participantId}, ${p.teamPosition || "no role"}). Riot: ${riot}. Missing: ${check.missing.join(" ") || "none"}. Extra: ${check.extra.join(" ") || "none"}. Rebuilt trinket ${check.trinket.rebuilt}, boots slot ${check.boots}.`,
  ];
  for (const e of mine) {
    if (!moments.has(e.timestamp)) continue;
    const item = e.type === "ITEM_UNDO" ? `${e.beforeId} -> ${e.afterId}` : `${e.itemId}`;
    lines.push(`    ${formatClock(e.timestamp)} (${e.timestamp}) ${e.type} ${item}`);
  }
  if (moments.size === 0) lines.push("    (no item events about these items)");
  return lines.join("\n");
}

// The rebuilt boots slot, next to the role-bound item Riot lists for the
// player, if the match has that field.
function bootsLine({ match }: ItemCheckGame, check: ItemCheck): string {
  const p = match.info.participants.find((x) => x.participantId === check.participantId)!;
  const roleBound = (p as Record<string, unknown>).roleBoundItem;
  const riot = roleBound === undefined ? "not in the match" : String(roleBound);
  return `${match.metadata.matchId} ${check.championName} (${p.teamPosition}): rebuilt ${check.boots}, roleBoundItem ${riot}`;
}

main();
