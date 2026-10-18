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

type Miss = { label: string; champions: string[]; examples: string[] };

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
  const tooMany: string[] = [];
  // The role quest's slot at the end, Riot's against the rebuild's, for
  // every player with an item there in either (not just the quest's hidden
  // item).
  const roleSlots = new Map<string, { players: number; same: number }>();
  const roleSlotMisses: string[] = [];
  const eventTypes = new Map<string, number>();

  for (const file of files) {
    const game = JSON.parse(readFileSync(join(ITEM_CHECK_FOLDER, file), "utf8")) as ItemCheckGame;
    for (const e of rawEvents(game.timeline)) {
      eventTypes.set(e.type, (eventTypes.get(e.type) ?? 0) + 1);
    }

    for (const check of checkItems(game)) {
      players++;
      const p = player(game, check);
      const items = check.missing.length === 0 && check.extra.length === 0;
      const trinket = check.trinket.riot === check.trinket.rebuilt;
      if (items) itemsRight++;
      if (trinket) trinketRight++;
      if (items && trinket) allRight++;

      const { riot, rebuilt } = check.roleItem;
      if (riot || rebuilt) {
        const key = `${p.teamPosition || "no role"}, Riot ${riot ?? "not listed"}`;
        const row = roleSlots.get(key) ?? { players: 0, same: 0 };
        row.players++;
        if (riot === rebuilt) row.same++;
        else roleSlotMisses.push(`${game.match.metadata.matchId} ${check.championName}: Riot ${riot}, rebuilt ${rebuilt}`);
        roleSlots.set(key, row);
      }

      if (check.tooMany) {
        // The first few with their events, the rest by name.
        const { at, slots } = check.tooMany;
        tooMany.push(
          tooMany.length < EXAMPLES
            ? `At ${formatClock(at)}, the rebuild held ${slots.join(" ")}. ${example(game, check, [], at)}`
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
        kinds.set(`Trinket: Riot ${check.trinket.riot}, rebuilt ${check.trinket.rebuilt}`, [
          check.trinket.riot,
          check.trinket.rebuilt,
          3513,
        ]);
      }
      for (const [label, ids] of kinds) {
        const miss = misses.get(label) ?? { label, champions: [], examples: [] };
        miss.champions.push(`${check.championName} (${p.teamPosition || "no role"})`);
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
  const sorted = [...misses.values()].sort((a, b) => b.champions.length - a.champions.length);
  for (const miss of sorted) {
    console.log(`- ${miss.label}: ${plural(miss.champions.length, "player")} (${counted(miss.champions)})`);
  }

  console.log(`\n## The role quest's slot at the end\n`);
  console.log(`By role and the item Riot lists there (roleBoundItem), how often the rebuild has the same.\n`);
  for (const [key, row] of [...roleSlots].sort((a, b) => b[1].players - a[1].players)) {
    console.log(`- ${key}: ${plural(row.players, "player")}, ${row.same} the same`);
  }
  console.log(`\nDifferent: ${roleSlotMisses.slice(0, 15).join("; ") || "none"}\n`);

  console.log(`## More than six items\n`);
  console.log(`${plural(tooMany.length, "player")} held more than six items at some point in the rebuild, so it missed an item leaving. The first ones, with their item events up to that moment:\n`);
  for (const line of tooMany.slice(0, EXAMPLES)) console.log(`${line}\n`);
  console.log(`Others: ${tooMany.slice(EXAMPLES).join(", ") || "none"}\n`);

  console.log(`## The item events behind each kind of miss\n`);
  console.log(`The events about the items in the miss, with the player's other item events at those moments. When there are none, all the player's item events.\n`);
  for (const miss of sorted) {
    console.log(`### ${miss.label}\n`);
    for (const lines of miss.examples) console.log(`${lines}\n`);
  }

  console.log(`## Event types in these timelines\n`);
  for (const [type, count] of [...eventTypes].sort((a, b) => b[1] - a[1])) {
    console.log(`- ${type}: ${count}`);
  }
}

type RawEvent = Timeline["info"]["frames"][number]["events"][number];

function rawEvents(timeline: Timeline): RawEvent[] {
  return timeline.info.frames.flatMap((frame) => frame.events);
}

function player({ match }: ItemCheckGame, check: ItemCheck) {
  return match.info.participants.find((x) => x.participantId === check.participantId)!;
}

// "Sona ×5, Nami, Lulu": each name once, most common first.
function counted(names: string[]): string {
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .map(([name, n]) => (n > 1 ? `${name} ×${n}` : name))
    .join(", ");
}

// The item a raw event is about: for an undo, the item bought or sold.
function itemOf(e: RawEvent): number {
  return Number(e.itemId ?? (e.beforeId || e.afterId) ?? 0);
}

// One player's final items, Riot's and rebuilt, then their item events
// about `ids`, with their other item events at the same milliseconds. With
// `until`, or when no event is about `ids`, all their item events instead
// (up to `until`).
function example(game: ItemCheckGame, check: ItemCheck, ids: number[], until?: number): string {
  const p = player(game, check);
  const riot = [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6].join(" ");
  const mine = rawEvents(game.timeline).filter(
    (e) => e.type.startsWith("ITEM_") && e.participantId === check.participantId,
  );
  const moments = new Set(mine.filter((e) => ids.includes(itemOf(e))).map((e) => e.timestamp));
  const header = `${game.match.metadata.matchId} ${check.championName} (participant ${check.participantId}, ${p.teamPosition || "no role"}). Riot: ${riot}, role slot ${p.roleBoundItem ?? "not listed"}. Missing: ${check.missing.join(" ") || "none"}. Extra: ${check.extra.join(" ") || "none"}. Rebuilt trinket ${check.trinket.rebuilt}, role slot ${check.roleItem.rebuilt}.`;

  if (until !== undefined || moments.size === 0) {
    // Compact, ten to a line.
    const all = mine.filter((e) => until === undefined || e.timestamp <= until).map(short);
    const lines = [header, "    All item events (P bought, S sold, D destroyed, U undone before>after):"];
    for (let i = 0; i < all.length; i += 10) lines.push(`    ${all.slice(i, i + 10).join(" · ")}`);
    return lines.join("\n");
  }
  const lines = [header];
  for (const e of mine) {
    if (!moments.has(e.timestamp)) continue;
    const item = e.type === "ITEM_UNDO" ? `${e.beforeId} -> ${e.afterId}` : `${e.itemId}`;
    lines.push(`    ${formatClock(e.timestamp)} (${e.timestamp}) ${e.type} ${item}`);
  }
  return lines.join("\n");
}

// "12:34 P 1001": the clock, the kind of event and the item.
function short(e: RawEvent): string {
  const kinds: Record<string, string> = {
    ITEM_PURCHASED: "P",
    ITEM_SOLD: "S",
    ITEM_DESTROYED: "D",
    ITEM_UNDO: "U",
  };
  const item = e.type === "ITEM_UNDO" ? `${e.beforeId}>${e.afterId}` : `${e.itemId}`;
  return `${formatClock(e.timestamp)} ${kinds[e.type] ?? e.type} ${item}`;
}

main();
